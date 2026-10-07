import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import {
  kvkkRequests,
  memberships,
  notifications,
  subscriptions,
  tenants,
  users,
  withTenant,
} from "@yonetim/db";

const DAY_MS = 86_400_000;
const LEGAL_RESPONSE_DAYS = 30;

/**
 * Uyum işleri — deneme bitişi, KVKK başvuru süresi, KVKK saklama süresi.
 *
 * Bildirimler uygulama içi (`notifications.channel = in_app`) ve tekil:
 * `(user_id, resource_type, resource_id, template)` benzersiz indeksi (0013)
 * sayesinde saatlik koşan iş aynı uyarıyı ikinci kez yazmıyor —
 * `ON CONFLICT DO NOTHING`.
 *
 * Metin alıcının dilinde, işin kendisinde üretiliyor: zil `subject`'i
 * gösteriyor ve worker'ın i18n kataloğu yok. Metin kısa ve olgusal.
 */

type Locale = "tr" | "en";

const TEXT = {
  kvkk_due_soon: {
    tr: (n: number) => ({ subject: "KVKK başvurusu yanıt bekliyor", body: `Yasal yanıt süresinin dolmasına ${n} gün kaldı.` }),
    en: (n: number) => ({ subject: "KVKK request awaiting reply", body: `${n} days left before the legal reply deadline.` }),
  },
  kvkk_overdue: {
    tr: () => ({ subject: "KVKK başvurusunun yasal süresi doldu", body: "30 günlük yanıt süresi geçti (KVKK md.13). Başvuruyu hemen sonuçlandırın." }),
    en: () => ({ subject: "KVKK request is overdue", body: "The 30-day reply period has passed (KVKK art.13). Resolve the request now." }),
  },
  kvkk_retention_due: {
    tr: (n: number) => ({ subject: "Saklama süresi dolan kişisel veri", body: `${n} eski sakinin saklama süresi doldu. KVKK ekranından gözden geçirin.` }),
    en: (n: number) => ({ subject: "Personal data past its retention period", body: `${n} former residents are past the retention period. Review them on the KVKK screen.` }),
  },
} as const;

function pick(locale: string | null | undefined): Locale {
  return locale === "en" ? "en" : "tr";
}

/** Sitenin KVKK sorumluları — yönetici ve firma yöneticisi. */
async function managers(tx: Parameters<Parameters<typeof withTenant>[1]>[0]) {
  return tx
    .select({ userId: memberships.userId, locale: users.locale })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        isNull(memberships.deletedAt),
        inArray(memberships.role, ["manager", "company_admin"]),
        isNull(users.deletedAt),
      ),
    );
}

/* -------------------------------------------------------------------------- */

export interface KvkkSlaResult {
  tenantId: string;
  open: number;
  dueSoon: number;
  overdue: number;
  notified: number;
}

/**
 * `kvkk.request-sla` — açık başvurular için uyarı.
 *
 * İki eşik: yasal sürenin (30 gün) son 7 günü "yaklaşıyor", süre geçtiyse
 * "doldu". İç hedefin (72 saat) kaçırılması uyarı üretmiyor: kanuna aykırılık
 * değil ve saatlik iş her açık başvuru için gürültü üretirdi.
 */
export async function kvkkRequestSla(params: { tenantId: string; now?: Date }): Promise<KvkkSlaResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const open = await tx
      .select({ id: kvkkRequests.id, createdAt: kvkkRequests.createdAt })
      .from(kvkkRequests)
      .where(inArray(kvkkRequests.status, ["received", "in_progress"]));

    const recipients = open.length > 0 ? await managers(tx) : [];
    let dueSoon = 0;
    let overdue = 0;
    let notified = 0;

    for (const request of open) {
      const legalDue = request.createdAt.getTime() + LEGAL_RESPONSE_DAYS * DAY_MS;
      const daysLeft = Math.ceil((legalDue - now.getTime()) / DAY_MS);
      const template = daysLeft < 0 ? "kvkk_overdue" : daysLeft <= 7 ? "kvkk_due_soon" : null;
      if (!template) continue;
      if (template === "kvkk_overdue") overdue += 1;
      else dueSoon += 1;

      for (const recipient of recipients) {
        const locale = pick(recipient.locale);
        const text = template === "kvkk_overdue" ? TEXT.kvkk_overdue[locale]() : TEXT.kvkk_due_soon[locale](daysLeft);
        const inserted = await tx
          .insert(notifications)
          .values({
            tenantId: params.tenantId,
            userId: recipient.userId,
            channel: "in_app",
            template,
            subject: text.subject,
            body: text.body,
            params: { daysLeft },
            recipient: recipient.userId,
            status: "sent",
            sentAt: now,
            resourceType: "kvkk_request",
            resourceId: request.id,
          })
          .onConflictDoNothing()
          .returning({ id: notifications.id });
        notified += inserted.length;
      }
    }

    return { tenantId: params.tenantId, open: open.length, dueSoon, overdue, notified };
  });
}

/* -------------------------------------------------------------------------- */

export interface KvkkRetentionResult {
  tenantId: string;
  candidates: number;
  notified: number;
  /** Saklama süresi dolup anonimleştirilen ziyaretçi kaydı. */
  visitorsAnonymized: number;
}

/**
 * Ziyaretçi defteri saklama süresi (gün). Ziyaretçinin adı, telefonu ve
 * plakası güvenlik amacıyla tutuluyor; bir yıldan eski kaydın o amaca hizmeti
 * yok (KVKK md.4 — amaçla sınırlı, gerektiği kadar saklama). Sakinden farklı
 * olarak burada yönetici kararı gerekmiyor: kayıt bir kişinin hesabı değil.
 */
export const VISITOR_RETENTION_DAYS = 365;

/**
 * `kvkk.retention` — saklama süresi dolan eski sakinleri BULUR, silmez.
 *
 * Aday: bu sitedeki üyeliği kapanmış, son daire ilişkisi
 * `passiveResidentRetentionYears` önce bitmiş, ödenmemiş borcu olmayan ve
 * henüz anonimleştirilmemiş kişi.
 *
 * NEDEN OTOMATİK SİLMİYOR: anonimleştirme geri alınamaz ve kişinin başka bir
 * sitedeki üyeliği, süren bir dava ya da yönetimin bilmediğimiz bir saklama
 * gerekçesi olabilir. Karar yöneticide; iş ona ayda bir hatırlatıyor.
 */
export async function kvkkRetentionScan(params: { tenantId: string; now?: Date }): Promise<KvkkRetentionResult> {
  const now = params.now ?? new Date();
  const cutoff = new Date(now.getFullYear() - siteConfig.legal.passiveResidentRetentionYears, now.getMonth(), now.getDate());
  const monthKey = now.toISOString().slice(0, 7);

  return withTenant(params.tenantId, async (tx) => {
    const visitorCutoff = new Date(now.getTime() - VISITOR_RETENTION_DAYS * 86_400_000);
    const anonymized = (await tx.execute(sql`
      UPDATE visitors
      SET visitor_name = 'Anonim ziyaretçi', phone = NULL, plate = NULL, note = NULL, updated_at = now()
      WHERE arrived_at < ${visitorCutoff.toISOString()}::timestamptz
        AND (phone IS NOT NULL OR plate IS NOT NULL OR note IS NOT NULL OR visitor_name <> 'Anonim ziyaretçi')
      RETURNING id
    `)) as unknown as Array<{ id: string }>;
    const visitorsAnonymized = anonymized.length;

    const rows = (await tx.execute(sql`
      SELECT m.user_id
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.deleted_at IS NOT NULL
        AND m.role IN ('owner', 'tenant_resident')
        AND u.anonymized_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM memberships m2
          WHERE m2.user_id = m.user_id AND m2.deleted_at IS NULL
        )
        AND COALESCE((
          SELECT MAX(o.end_date) FROM unit_occupancies o WHERE o.user_id = m.user_id
        ), m.deleted_at) < ${cutoff.toISOString()}::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM debts d
          WHERE d.debtor_user_id = m.user_id AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off')
        )
      GROUP BY m.user_id
    `)) as unknown as Array<{ user_id: string }>;

    if (rows.length === 0) return { tenantId: params.tenantId, candidates: 0, notified: 0, visitorsAnonymized };

    let notified = 0;
    for (const recipient of await managers(tx)) {
      const text = TEXT.kvkk_retention_due[pick(recipient.locale)](rows.length);
      const inserted = await tx
        .insert(notifications)
        .values({
          tenantId: params.tenantId,
          userId: recipient.userId,
          channel: "in_app",
          // Ayda bir hatırlatma: şablon adı ayı taşıyor, tekil indeks
          // aynı ay içinde ikinci kaydı engelliyor.
          template: `kvkk_retention_due:${monthKey}`,
          subject: text.subject,
          body: text.body,
          params: { candidates: rows.length },
          recipient: recipient.userId,
          status: "sent",
          sentAt: now,
          resourceType: "kvkk_request",
          resourceId: params.tenantId,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      notified += inserted.length;
    }
    return { tenantId: params.tenantId, candidates: rows.length, notified, visitorsAnonymized };
  });
}

/* -------------------------------------------------------------------------- */

export interface TrialExpiryResult {
  tenantId: string;
  suspended: boolean;
}

/**
 * `billing.trial-expiry` — deneme süresi biten siteyi askıya alır.
 *
 * Panelde yazan söz: "Deneme bitiminde otomatik ücret alınmaz; hesabınız
 * askıya alınır ve verileriniz 6 ay saklanır." Askıya alınan sitede okuma
 * sürüyor, yazma `TenantWritableGuard`'da kesiliyor; platform panelinden süre
 * uzatma (`subscriptions/extend`) siteyi geri açıyor.
 *
 * Yalnız `trial` durumundaki ve süresi gerçekten geçmiş site: ödeme yapmış
 * (`active`) bir site, deneme tarihi eski kalmış olsa da etkilenmez.
 */
export async function expireTrial(params: { tenantId: string; now?: Date }): Promise<TrialExpiryResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const updated = await tx
      .update(tenants)
      .set({ status: "suspended", suspensionReason: "trial_expired", updatedAt: now })
      .where(
        and(
          eq(tenants.id, params.tenantId),
          eq(tenants.status, "trial"),
          lt(tenants.trialEndsAt, now),
        ),
      )
      .returning({ id: tenants.id });

    if (updated.length > 0) {
      await tx
        .update(subscriptions)
        .set({ status: "suspended", updatedAt: now })
        .where(and(eq(subscriptions.tenantId, params.tenantId), eq(subscriptions.status, "trialing")));
    }
    return { tenantId: params.tenantId, suspended: updated.length > 0 };
  });
}
