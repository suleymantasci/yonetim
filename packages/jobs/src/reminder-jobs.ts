import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";

import {
  agendaItems,
  debts,
  documents,
  meetings,
  memberships,
  notifications,
  requests,
  users,
  withTenant,
} from "@yonetim/db";

const DAY_MS = 86_400_000;

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];
type Locale = "tr" | "en";
const pick = (l: string | null | undefined): Locale => (l === "en" ? "en" : "tr");

/**
 * Hatırlatma ve uyarı işleri — SLA ihlali, toplantı, belge süresi, borç.
 *
 * Hepsi **uygulama içi** bildirim yazıyor (zil + bildirim merkezi). Harici
 * kanal (SMS/WhatsApp/e-posta) bu işlerden gitmiyor: o yol olay kuyruğu +
 * `route()` + kredi düşümü zincirinden geçiyor ve gece işinin ayrı bir yol
 * açması, kota ve sessiz saat kurallarını atlamak demek olurdu.
 *
 * TEKİLLİK: `(user_id, resource_type, resource_id, template)` benzersiz
 * indeksi sayesinde günlük/saatlik koşu aynı uyarıyı ikinci kez yazmıyor. Bu
 * yüzden eşik şablon adına giriyor (`meeting_reminder_t7`): her eşik bir kez.
 */

interface Recipient {
  userId: string;
  locale: string | null;
}

async function usersWithRoles(tx: Tx, roles: string[]): Promise<Recipient[]> {
  return tx
    .select({ userId: memberships.userId, locale: users.locale })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        isNull(memberships.deletedAt),
        inArray(memberships.role, roles as never),
        isNull(users.deletedAt),
      ),
    );
}

async function writeInApp(
  tx: Tx,
  p: {
    tenantId: string;
    recipient: Recipient;
    template: string;
    resourceType: string;
    resourceId: string;
    text: Record<Locale, { subject: string; body: string }>;
    now: Date;
  },
): Promise<number> {
  const t = p.text[pick(p.recipient.locale)];
  const inserted = await tx
    .insert(notifications)
    .values({
      tenantId: p.tenantId,
      userId: p.recipient.userId,
      channel: "in_app",
      template: p.template,
      subject: t.subject,
      body: t.body,
      params: {},
      recipient: p.recipient.userId,
      status: "sent",
      sentAt: p.now,
      resourceType: p.resourceType,
      resourceId: p.resourceId,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
}

const MANAGER_ROLES = ["manager", "company_admin"];

/* -------------------------------------------------------------------------- */

export interface SlaBreachResult {
  tenantId: string;
  breached: number;
  notified: number;
}

/**
 * `sla.breach-check` — süresi dolan açık talepleri işaretler, yöneticiyi uyarır.
 *
 * "Açık" = çözülmemiş durumlar. İşaretleme `sla_breached_at IS NULL` koşuluyla
 * yapıldığı için talep bir kez işaretleniyor; her 15 dakikada yeniden
 * işaretlemek zaman damgasını sürekli ileri alırdı ve ihlalin ne zaman
 * başladığı kaybolurdu.
 */
export async function slaBreachCheck(params: { tenantId: string; now?: Date }): Promise<SlaBreachResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const marked = await tx
      .update(requests)
      .set({ slaBreachedAt: now, updatedAt: now })
      .where(
        and(
          isNull(requests.deletedAt),
          isNull(requests.slaBreachedAt),
          isNotNull(requests.slaDueAt),
          lt(requests.slaDueAt, now),
          inArray(requests.status, ["open", "assigned", "in_progress", "waiting_resident"]),
        ),
      )
      .returning({ id: requests.id, code: requests.code, title: requests.title });

    let notified = 0;
    if (marked.length > 0) {
      const managers = await usersWithRoles(tx, MANAGER_ROLES);
      for (const r of marked) {
        for (const m of managers) {
          notified += await writeInApp(tx, {
            tenantId: params.tenantId,
            recipient: m,
            template: "request_sla_breached",
            resourceType: "request",
            resourceId: r.id,
            text: {
              tr: { subject: "Talep SLA süresini aştı", body: `${r.code} — ${r.title} için hedef süre doldu.` },
              en: { subject: "Request breached its SLA", body: `${r.code} — ${r.title} passed its target time.` },
            },
            now,
          });
        }
      }
    }
    return { tenantId: params.tenantId, breached: marked.length, notified };
  });
}

/* -------------------------------------------------------------------------- */

export interface MeetingReminderResult {
  tenantId: string;
  meetings: number;
  notified: number;
}

/** T-15 / T-7 / T-1: bu eşiklerden birine girmiş toplantılar. */
const MEETING_THRESHOLDS = [15, 7, 1] as const;

/**
 * `meetings.reminders` — planlı toplantı için T-15/T-7/T-1 günlerinde malik ve
 * yöneticileri uyarır. Her eşik bir kez: toplantıya 6 gün kala ilk koşu
 * `t7`'yi, 1 gün kala `t1`'i yazar; 15 günü kaçırmış (geç planlanmış) toplantı
 * geriye dönük `t15` almaz — yalnız **içinde bulunulan** en yakın eşik.
 */
export async function meetingReminders(params: { tenantId: string; now?: Date }): Promise<MeetingReminderResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const upcoming = await tx
      .select({ id: meetings.id, title: meetings.title, scheduledAt: meetings.scheduledAt })
      .from(meetings)
      .where(
        and(
          isNull(meetings.deletedAt),
          eq(meetings.status, "planned"),
          gte(meetings.scheduledAt, now),
          lte(meetings.scheduledAt, new Date(now.getTime() + 15 * DAY_MS)),
        ),
      );
    if (upcoming.length === 0) return { tenantId: params.tenantId, meetings: 0, notified: 0 };

    const audience = await usersWithRoles(tx, [...MANAGER_ROLES, "owner"]);
    let notified = 0;
    for (const m of upcoming) {
      const daysLeft = Math.ceil((m.scheduledAt.getTime() - now.getTime()) / DAY_MS);
      const threshold = [...MEETING_THRESHOLDS].reverse().find((t) => daysLeft <= t);
      if (!threshold) continue;
      const when = m.scheduledAt.toISOString().slice(0, 10);
      for (const u of audience) {
        notified += await writeInApp(tx, {
          tenantId: params.tenantId,
          recipient: u,
          template: `meeting_reminder_t${threshold}`,
          resourceType: "meeting",
          resourceId: m.id,
          text: {
            tr: { subject: "Toplantı hatırlatması", body: `"${m.title}" toplantısına ${threshold === 1 ? "1 gün" : `${threshold} gün`} kaldı (${when}).` },
            en: { subject: "Meeting reminder", body: `"${m.title}" is in ${threshold === 1 ? "1 day" : `${threshold} days`} (${when}).` },
          },
          now,
        });
      }
    }
    return { tenantId: params.tenantId, meetings: upcoming.length, notified };
  });
}

/* -------------------------------------------------------------------------- */

export interface DocumentExpiryResult {
  tenantId: string;
  documents: number;
  notified: number;
}

/**
 * `documents.expiry` — süresi 30 gün içinde dolacak ya da dolmuş sözleşme/
 * poliçe/ruhsatı yöneticiye hatırlatır. Eşikler: 30 gün, 7 gün, dolmuş —
 * her biri belge başına bir kez.
 */
export async function documentExpiry(params: { tenantId: string; now?: Date }): Promise<DocumentExpiryResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const rows = await tx
      .select({ id: documents.id, title: documents.title, expiresAt: documents.expiresAt })
      .from(documents)
      .where(
        and(
          isNull(documents.deletedAt),
          isNotNull(documents.expiresAt),
          lte(documents.expiresAt, new Date(now.getTime() + 30 * DAY_MS)),
          // Çok eski (1 yıldan fazla önce dolmuş) belge gürültü: unutulmuş arşiv.
          gte(documents.expiresAt, new Date(now.getTime() - 365 * DAY_MS)),
        ),
      );
    if (rows.length === 0) return { tenantId: params.tenantId, documents: 0, notified: 0 };

    const managers = await usersWithRoles(tx, MANAGER_ROLES);
    let notified = 0;
    for (const d of rows) {
      const exp = d.expiresAt!;
      const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / DAY_MS);
      const stage = daysLeft < 0 ? "expired" : daysLeft <= 7 ? "7" : "30";
      for (const m of managers) {
        notified += await writeInApp(tx, {
          tenantId: params.tenantId,
          recipient: m,
          template: `document_expiry_${stage}`,
          resourceType: "document",
          resourceId: d.id,
          text:
            stage === "expired"
              ? {
                  tr: { subject: "Belgenin süresi doldu", body: `"${d.title}" belgesinin süresi doldu. Yenileyin.` },
                  en: { subject: "Document expired", body: `"${d.title}" has expired. Please renew it.` },
                }
              : {
                  tr: { subject: "Belge süresi doluyor", body: `"${d.title}" belgesinin süresinin dolmasına ${daysLeft} gün kaldı.` },
                  en: { subject: "Document expiring", body: `"${d.title}" expires in ${daysLeft} days.` },
                },
          now,
        });
      }
    }
    return { tenantId: params.tenantId, documents: rows.length, notified };
  });
}

/* -------------------------------------------------------------------------- */

export interface DuesNoticeResult {
  tenantId: string;
  debts: number;
  notified: number;
}

const OPEN_DEBT = ["pending", "partial", "overdue"] as const;

async function duesNotice(
  params: { tenantId: string; now?: Date },
  window: { fromDays: number; toDays: number },
  template: string,
  text: (daysAway: number, amount: string) => Record<Locale, { subject: string; body: string }>,
): Promise<DuesNoticeResult> {
  const now = params.now ?? new Date();
  const from = new Date(now.getTime() + window.fromDays * DAY_MS);
  const to = new Date(now.getTime() + window.toDays * DAY_MS);
  return withTenant(params.tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: debts.id,
        debtor: debts.debtorUserId,
        remaining: sql<number>`(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus})`.mapWith(Number),
        locale: users.locale,
      })
      .from(debts)
      .innerJoin(users, eq(users.id, debts.debtorUserId))
      .where(
        and(
          isNull(debts.deletedAt),
          isNotNull(debts.debtorUserId),
          inArray(debts.status, [...OPEN_DEBT]),
          gte(debts.dueDate, from),
          lt(debts.dueDate, to),
        ),
      );

    let notified = 0;
    for (const r of rows) {
      if (r.remaining <= 0 || !r.debtor) continue;
      const amount = `${(r.remaining / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;
      notified += await writeInApp(tx, {
        tenantId: params.tenantId,
        recipient: { userId: r.debtor, locale: r.locale },
        template,
        resourceType: "debt",
        resourceId: r.id,
        text: text(Math.abs(window.fromDays), amount),
        now,
      });
    }
    return { tenantId: params.tenantId, debts: rows.length, notified };
  });
}

/**
 * `dues.reminder` — vadesine 5 gün kalan (±1 gün pencere) borç için sakine
 * hatırlatma. Pencere 1 gün genişliğinde: günlük koşu her borcu bir kez
 * yakalıyor; kaçırılan gün (iş çalışmadı) için de tekillik indeksi tekrarı
 * engelliyor.
 */
export function duesReminder(params: { tenantId: string; now?: Date }): Promise<DuesNoticeResult> {
  return duesNotice(params, { fromDays: 4, toDays: 5 }, "dues_reminder_t5", (_d, amount) => ({
    tr: { subject: "Aidat vadesi yaklaşıyor", body: `${amount} tutarındaki borcunuzun vadesine yaklaşık 5 gün kaldı.` },
    en: { subject: "Dues due soon", body: `Your ${amount} balance is due in about 5 days.` },
  }));
}

/**
 * `dues.late-warning` — vadesi 7 gün geçmiş ve hâlâ açık borç için gecikme
 * uyarısı. Pencere vadeden 7-8 gün önce.
 */
export function duesLateWarning(params: { tenantId: string; now?: Date }): Promise<DuesNoticeResult> {
  return duesNotice(params, { fromDays: -8, toDays: -7 }, "dues_late_7", (_d, amount) => ({
    tr: { subject: "Borcunuzun vadesi geçti", body: `${amount} tutarındaki borcunuzun vadesi 7 gün önce doldu. Gecikme bedeli işleyebilir.` },
    en: { subject: "Your payment is overdue", body: `Your ${amount} balance was due 7 days ago. Late fees may apply.` },
  }));
}

/* -------------------------------------------------------------------------- */

export interface LegalEscalationResult {
  tenantId: string;
  candidates: number;
  totalKurus: number;
  notified: number;
}

/**
 * `legal.escalate` — 90+ gün gecikmiş, henüz icraya devredilmemiş borçlar için
 * yöneticiye **ayda bir** özet uyarı.
 *
 * İcra dosyasını **kendisi açmıyor**: dosya açmak geri alınması zor, masraf
 * doğuran bir karar (`legal:write` + gerekçe). İş yalnız "bu borçlar eşiği
 * geçti" bilgisini veriyor; karar yöneticide. Bildirim ay anahtarlı
 * (`legal_escalate_YYYY-MM`) olduğu için günlük/haftalık koşu aynı ay içinde
 * tekrar yazmıyor.
 */
export async function legalEscalation(params: { tenantId: string; now?: Date }): Promise<LegalEscalationResult> {
  const now = params.now ?? new Date();
  const cutoff = new Date(now.getTime() - 90 * DAY_MS);
  const month = now.toISOString().slice(0, 7);
  return withTenant(params.tenantId, async (tx) => {
    const [row] = await tx
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        total: sql<number>`COALESCE(sum(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`.mapWith(Number),
      })
      .from(debts)
      .where(
        and(
          isNull(debts.deletedAt),
          isNull(debts.legalCaseId),
          inArray(debts.status, [...OPEN_DEBT]),
          lt(debts.dueDate, cutoff),
        ),
      );
    const candidates = row?.count ?? 0;
    const total = row?.total ?? 0;
    if (candidates === 0) return { tenantId: params.tenantId, candidates: 0, totalKurus: 0, notified: 0 };

    const amount = `${(total / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;
    let notified = 0;
    for (const m of await usersWithRoles(tx, MANAGER_ROLES)) {
      notified += await writeInApp(tx, {
        tenantId: params.tenantId,
        recipient: m,
        template: `legal_escalate_${month}`,
        resourceType: "tenant",
        resourceId: params.tenantId,
        text: {
          tr: { subject: "İcra takibi eşiğini geçen borçlar", body: `${candidates} borç 90 günden uzun süredir ödenmedi (toplam ${amount}). Hukuk ekranından icra takibi değerlendirebilirsiniz.` },
          en: { subject: "Debts past the legal-action threshold", body: `${candidates} debts have been unpaid for over 90 days (total ${amount}). You can consider legal action from the Legal screen.` },
        },
        now,
      });
    }
    return { tenantId: params.tenantId, candidates, totalKurus: total, notified };
  });
}

/* -------------------------------------------------------------------------- */

export interface AgendaReminderResult {
  tenantId: string;
  items: number;
  notified: number;
}

/**
 * `agenda.reminders` — hatırlatma zamanı gelen ajanda kayıtları.
 *
 * Kişisel kayıt yalnız sahibine, paylaşılan kayıt sahibine ve sitenin
 * yöneticilerine düşer. Tamamlanmış görev bildirim üretmez ama
 * `reminded_at` yine yazılır: kısmi indeks ("hatırlatılmamış") boşalsın.
 *
 * Şablon adı hatırlatma dakikasını taşıyor (`agenda_29341234`): kullanıcı
 * kaydın tarihini değiştirirse tekillik indeksi ikinci hatırlatmayı
 * yutmasın.
 */
export async function agendaReminders(params: { tenantId: string; now?: Date }): Promise<AgendaReminderResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const due = await tx
      .select()
      .from(agendaItems)
      .where(
        and(
          isNull(agendaItems.remindedAt),
          isNull(agendaItems.deletedAt),
          isNotNull(agendaItems.remindAt),
          lte(agendaItems.remindAt, now),
        ),
      )
      .limit(500);
    if (due.length === 0) return { tenantId: params.tenantId, items: 0, notified: 0 };

    const managers = due.some((d) => d.shared) ? await usersWithRoles(tx, MANAGER_ROLES) : [];
    const authorIds = [...new Set(due.map((d) => d.createdBy))];
    const authors = await tx
      .select({ userId: users.id, locale: users.locale })
      .from(users)
      .where(and(inArray(users.id, authorIds), isNull(users.deletedAt)));
    const authorById = new Map(authors.map((a) => [a.userId, a] as const));

    let notified = 0;
    for (const item of due) {
      if (!item.doneAt) {
        const recipients = new Map<string, Recipient>();
        const author = authorById.get(item.createdBy);
        if (author) recipients.set(author.userId, author);
        if (item.shared) for (const m of managers) recipients.set(m.userId, m);
        const isTask = item.kind === "task";
        for (const recipient of recipients.values()) {
          notified += await writeInApp(tx, {
            tenantId: params.tenantId,
            recipient,
            template: `agenda_${Math.floor(item.remindAt!.getTime() / 60_000)}`,
            resourceType: "agenda",
            resourceId: item.id,
            text: {
              tr: {
                subject: isTask ? `Görev: ${item.title}` : `Not: ${item.title}`,
                body: item.body?.slice(0, 280) || (isTask ? "Ajandadaki görevin zamanı geldi." : "Ajandadaki notun zamanı geldi."),
              },
              en: {
                subject: isTask ? `Task: ${item.title}` : `Note: ${item.title}`,
                body: item.body?.slice(0, 280) || (isTask ? "Your agenda task is due." : "Your agenda note is due."),
              },
            },
            now,
          });
        }
      }
    }
    await tx
      .update(agendaItems)
      .set({ remindedAt: now })
      .where(inArray(agendaItems.id, due.map((d) => d.id)));
    return { tenantId: params.tenantId, items: due.length, notified };
  });
}
