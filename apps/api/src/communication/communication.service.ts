import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  AnnouncementCreate,
  AnnouncementCreateResult,
  AnnouncementListResponse,
  AnnouncementUpdate,
  MeetingListResponse,
  MessageListResponse,
  MessageThreadDetail,
  PollListResponse,
} from "@yonetim/contracts";

import { maskPhone } from "@yonetim/core";
import { RATE_LIMITS, rateLimit } from "@yonetim/auth/rate-limit";
import { filterContent, requiresIndividualDelivery } from "@yonetim/kvkk";
import { errors } from "@yonetim/core";

/** Sakin kaydıyla eşleşmemiş mesajların ortak kovası — cevaplanamaz. */
const UNMATCHED = "unmatched";

import { AuditService } from "../governance/audit/audit.service";
import { grants } from "../identity/permission";
import { DbService } from "../infra/db/db.service";
import { CommunicationRepository } from "./communication.repository";
import { announcements } from "@yonetim/db";

/** `communication` iş akışı — MIMARI-PLAN §8.5, §9a. */
@Injectable()
export class CommunicationService {
  constructor(
    private readonly repo: CommunicationRepository,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    /** Yalnız `ctx()` için: acil duyuru yetkisi isteğin içeriğine bağlı. */
    private readonly db: DbService,
  ) {}

  /**
   * Duyuru oluşturur — KVKK filtresi **kapı** olarak (SPEC 6.4).
   *
   * Tarama burada yapılıyor ve engellenen duyuru hiç kaydedilmiyor. Filtreyi
   * istemcide bırakıp sonucuna güvenseydik, kapı diye bir şey kalmazdı:
   * doğrudan API'ye istek atan bir istemci filtreyi atlardı. Panelin yazarken
   * gösterdiği canlı kontrol aynı saf fonksiyonu çağırıyor ama o önizleme.
   */
  async createAnnouncement(
    dto: AnnouncementCreate,
  ): Promise<AnnouncementCreateResult> {
    /*
     * Acil durum **ayrı bir yetki** — `announcement:write` yetmiyor.
     *
     * `isUrgent` yalnız bir rozet değil: aşağıdaki override sakinin kanal
     * tercihini geçersiz kılıp WhatsApp, SMS, e-posta ve uygulama içi
     * bildirimin **hepsini** açıyor. Yani duyuru yazabilen herkes, gecenin
     * bir yarısı bütün sakinlerin telefonunu çaldırabiliyordu. Yetki
     * `packages/core/rbac.ts` içinde tanımlıydı ama hiçbir yerde
     * kullanılmıyordu (PROJE-DURUMU §5.1).
     *
     * Kontrol dekoratörle yapılamıyor: aynı uç hem sıradan hem acil duyuru
     * oluşturuyor, fark gövdedeki bayrakta. Karar bu yüzden burada, ama
     * "kim neye sahip" sorusunu guard ile **aynı** fonksiyon cevaplıyor.
     */
    if (dto.isUrgent && !grants(this.db.maybeCtx(), "announcement:send_urgent")) {
      throw new ForbiddenException("forbidden:announcement:send_urgent");
    }

    // M-35: Duyuru yayınlama hız sınırı. Manager başına 10/10dk + urgent
    // için ek 3/gün. Sahte yönetici hesabı bu hızda sakinlere spam atamaz.
    const ctx = this.db.maybeCtx();
    if (ctx?.userId) {
      const rule = dto.isUrgent
        ? RATE_LIMITS.urgentAnnouncement
        : RATE_LIMITS.announcement;
      const limit = await rateLimit(rule, `user:${ctx.userId}`);
      if (!limit.allowed) throw errors.rateLimited();
    }

    // Acil durum override'ı tüm kanalları açar (SPEC 6.4): yangın/su baskını
    // duyurusunun kanal tercihine takılması kabul edilebilir değil.
    const channels = dto.isUrgent
      ? [...new Set([...dto.channels, "whatsapp", "sms", "email", "in_app"])]
      : dto.channels;

    const filtered = filterContent(`${dto.title}\n${dto.body}`);
    const kvkk = {
      blocked: filtered.blocked,
      score: filtered.score,
      findings: filtered.findings.map((f) => ({
        severity: f.severity,
        code: f.code,
        match: f.match,
      })),
      requiresIndividual: requiresIndividualDelivery(filtered),
    };

    if (filtered.blocked) {
      // Engelleme de bir olaydır: kimin neyi göndermeye çalıştığı kütükte kalır.
      await this.audit.record({
        action: "announcement_blocked_kvkk",
        resource: "announcement",
        reason: filtered.findings.map((f) => f.code).join(","),
      });
      return { id: null, published: false, kvkk, channels };
    }

    const id = await this.repo.createAnnouncement({
      title: dto.title,
      body: dto.body,
      audience: dto.audience,
      channels,
      isUrgent: dto.isUrgent,
      publishedAt: dto.publish ? new Date() : null,
      kvkkFlagged: filtered.findings.length > 0,
      kvkkFindings: kvkk.findings,
    });

    await this.audit.record({
      action: dto.publish ? "announcement_published" : "announcement_drafted",
      resource: "announcement",
      resourceId: id,
    });

    // Yalnız **yayımlanmış** duyuru bildirim doğuruyor: taslak henüz bir
    // karar değil ve sakine haber vermek onu karara çevirirdi (B2 / §10).
    if (dto.publish) {
      this.events.emit("announcement.published", {
        event: "announcement.published",
        resourceId: id,
        params: { title: dto.title },
      });
    }

    return { id, published: dto.publish, kvkk, channels };
  }

  /**
   * Taslağı düzenle (ve isterse yayınla). Yayımlanmış duyuru 409: gönderilen
   * metinle kayıttaki metin ayrışmasın. Acil yetkisi ve KVKK filtresi
   * oluşturmadaki kuralların aynısı — düzenleme bir kaçış yolu olmasın.
   */
  async updateAnnouncement(id: string, dto: AnnouncementUpdate): Promise<AnnouncementCreateResult> {
    if (dto.isUrgent && !grants(this.db.maybeCtx(), "announcement:send_urgent")) {
      throw new ForbiddenException("forbidden:announcement:send_urgent");
    }
    const channels = dto.isUrgent
      ? [...new Set([...dto.channels, "whatsapp", "sms", "email", "in_app"])]
      : dto.channels;
    const filtered = filterContent(`${dto.title}\n${dto.body}`);
    const kvkk = {
      blocked: filtered.blocked,
      score: filtered.score,
      findings: filtered.findings.map((f) => ({ severity: f.severity, code: f.code, match: f.match })),
      requiresIndividual: requiresIndividualDelivery(filtered),
    };

    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ publishedAt: announcements.publishedAt })
        .from(announcements)
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.publishedAt) throw new ConflictException("conflict:announcement_already_published");
      if (filtered.blocked) return;
      await tx
        .update(announcements)
        .set({
          title: dto.title,
          body: dto.body,
          audience: dto.audience,
          channels,
          isUrgent: dto.isUrgent,
          publishedAt: dto.publish ? new Date() : null,
          kvkkFlagged: filtered.findings.length > 0,
          kvkkFindings: kvkk.findings,
        })
        .where(eq(announcements.id, id));
    });

    if (filtered.blocked) {
      await this.audit.record({
        action: "announcement_blocked_kvkk",
        resource: "announcement",
        resourceId: id,
        reason: filtered.findings.map((f) => f.code).join(","),
      });
      return { id: null, published: false, kvkk, channels };
    }

    await this.audit.record({
      action: dto.publish ? "announcement_published" : "announcement_edited",
      resource: "announcement",
      resourceId: id,
    });
    if (dto.publish) {
      this.events.emit("announcement.published", {
        event: "announcement.published",
        resourceId: id,
        params: { title: dto.title },
      });
    }
    return { id, published: dto.publish, kvkk, channels };
  }

  /** Taslağı sil (yumuşak). Yayımlanmış duyuru silinmez — yayından kaldırılır. */
  async deleteDraft(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ publishedAt: announcements.publishedAt })
        .from(announcements)
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.publishedAt) throw new ConflictException("conflict:announcement_already_published");
      await tx.update(announcements).set({ deletedAt: new Date() }).where(eq(announcements.id, id));
    });
    await this.audit.record({ action: "announcement_draft_deleted", resource: "announcement", resourceId: id });
    return { id };
  }

  /**
   * Yayından kaldır — bitiş zamanı şimdi. Kayıt ve gönderim geçmişi kalır
   * (kim neyi ne zaman duyurdu sorusunun cevabı silinmemeli); sakin portalı
   * ve WhatsApp botu bitişi geçmiş duyuruyu göstermiyor.
   */
  async withdraw(id: string, reason: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ publishedAt: announcements.publishedAt, expiresAt: announcements.expiresAt })
        .from(announcements)
        .where(and(eq(announcements.id, id), isNull(announcements.deletedAt)))
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (!row.publishedAt) throw new ConflictException("conflict:announcement_not_published");
      if (row.expiresAt && row.expiresAt.getTime() <= Date.now())
        throw new ConflictException("conflict:announcement_already_withdrawn");
      await tx.update(announcements).set({ expiresAt: new Date() }).where(eq(announcements.id, id));
    });
    await this.audit.record({ action: "announcement_withdrawn", resource: "announcement", resourceId: id, reason });
    return { id };
  }

  async announcements(): Promise<AnnouncementListResponse> {
    const rows = await this.repo.announcements();

    const mapped = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      audience: r.audience,
      channels: Array.isArray(r.channels) ? (r.channels as string[]) : [],
      isUrgent: r.isUrgent,
      scheduledAt: r.scheduledAt,
      publishedAt: r.publishedAt,
      expiresAt: r.expiresAt,
      // Bulguların kendisi listede yok: gizlenmesi gereken veriyi liste
      // ekranında göstermek onu ikinci kez yaymak olurdu.
      kvkkFlagged: r.kvkkFlagged,
      createdAt: r.createdAt,
    }));

    return {
      rows: mapped,
      totals: {
        published: mapped.filter((r) => r.publishedAt).length,
        scheduled: mapped.filter((r) => !r.publishedAt && r.scheduledAt).length,
        draft: mapped.filter((r) => !r.publishedAt && !r.scheduledAt).length,
        flagged: mapped.filter((r) => r.kvkkFlagged).length,
      },
    };
  }

  async polls(): Promise<PollListResponse> {
    const { rows, counts } = await this.repo.polls();
    const now = Date.now();
    const countByPoll = new Map(counts.map((c) => [c.pollId, Number(c.value)]));

    const mapped = rows.map((r) => ({
      id: r.id,
      question: r.question,
      description: r.description,
      options: Array.isArray(r.options) ? (r.options as unknown[]) : [],
      weightMode: r.weightMode,
      quorumRule: r.quorumRule,
      visibility: r.visibility,
      ownersOnly: r.ownersOnly,
      allowMultiple: r.allowMultiple,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      closedAt: r.closedAt,
      resultJson: r.resultJson ?? null,
      // "Açık mı" sunucu saatine göre: oylamanın kapanış anı tarayıcı
      // saatine bırakılamayacak kadar bağlayıcı bir olay.
      isOpen:
        !r.closedAt && r.opensAt.getTime() <= now && r.closesAt.getTime() > now,
      voteCount: countByPoll.get(r.id) ?? 0,
      createdAt: r.createdAt,
    }));

    return {
      rows: mapped,
      totals: {
        open: mapped.filter((r) => r.isOpen).length,
        closed: mapped.filter((r) => !r.isOpen).length,
      },
    };
  }

  /**
   * Gelen kutusu — mesajlar **kişiye göre** kümelenir.
   *
   * Düz mesaj kütüğü yöneticinin sorusuna cevap vermiyordu: aynı sakinin beş
   * mesajı beş ayrı satırdı, hiçbirinde kimin yazdığı görünmüyordu ve
   * cevaplamanın yolu yoktu. Kümeleme burada yapılıyor çünkü karar veriye
   * değil ekrana ait: SQL tarafında `DISTINCT ON` ile son mesajı çekmek aynı
   * listeyi verirdi ama "cevap bekliyor mu" kararı yine burada olurdu.
   */
  async messages(): Promise<MessageListResponse> {
    const { rows, unitLabels } = await this.repo.messages();

    const inbound = rows.filter((m) => m.direction === "in");
    const botHandled = inbound.filter((m) => m.handledByBot);

    // Sorgu yeniden eskiye sıralı; her anahtarın ilk görülen satırı en son
    // mesajı. `count` ile ilerledikçe konuşmanın hacmi de birikiyor.
    const threads = new Map<string, MessageListResponse["threads"][number]>();
    for (const m of rows) {
      const key = m.userId ?? UNMATCHED;
      const existing = threads.get(key);
      if (existing) {
        existing.messageCount += 1;
        continue;
      }
      threads.set(key, {
        correspondent: {
          id: m.userId,
          name: m.userId
            ? [m.firstName, m.lastName].filter(Boolean).join(" ") || null
            : null,
          unitLabel: m.userId ? (unitLabels.get(m.userId) ?? null) : null,
          phoneMasked: m.phone ? maskPhone(m.phone) : null,
        },
        channel: m.channel,
        lastBody: m.body,
        lastDirection: m.direction,
        lastAt: m.createdAt,
        messageCount: 1,
        // Son söz sakindeyse top yönetimde. Ayrı bir "okundu" tablosu yok;
        // bu ölçü rozetin sorduğu şeye ("dönmem gereken var mı") yetiyor.
        awaitingReply: m.direction === "in",
      });
    }

    const threadRows = [...threads.values()];

    return {
      threads: threadRows,
      totals: {
        inbound: inbound.length,
        botHandled: botHandled.length,
        needsHuman: inbound.length - botHandled.length,
        botRatePct:
          inbound.length > 0
            ? Math.round((botHandled.length / inbound.length) * 100)
            : 0,
        awaitingReply: threadRows.filter((t) => t.awaitingReply).length,
      },
    };
  }

  async messageThread(userId: string): Promise<MessageThreadDetail> {
    const { user, rows, unitLabels } = await this.repo.messageThread(userId);
    if (!user) throw new NotFoundException("not_found");

    return {
      correspondent: {
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        unitLabel: unitLabels.get(user.id) ?? null,
        phoneMasked: user.phone ? maskPhone(user.phone) : null,
      },
      rows,
    };
  }

  async meetings(): Promise<MeetingListResponse> {
    const { rows, decisions } = await this.repo.meetings();

    const byMeeting = new Map<string, typeof decisions>();
    for (const d of decisions) {
      const list = byMeeting.get(d.meetingId) ?? [];
      list.push(d);
      byMeeting.set(d.meetingId, list);
    }

    const mapped = rows.map((m) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      scheduledAt: m.scheduledAt,
      secondCallAt: m.secondCallAt,
      location: m.location,
      onlineUrl: m.onlineUrl,
      agenda: Array.isArray(m.agenda) ? (m.agenda as unknown[]) : [],
      attendanceShare: m.attendanceShare,
      quorumMet: m.quorumMet,
      minutesUrl: m.minutesUrl,
      status: m.status,
      decisions: (byMeeting.get(m.id) ?? []).map((d) => ({
        id: d.id,
        meetingId: d.meetingId,
        decisionNo: d.decisionNo,
        title: d.title,
        body: d.body,
        quorumRule: d.quorumRule,
        votesFor: d.votesFor,
        votesAgainst: d.votesAgainst,
        abstentions: d.abstentions,
        passed: d.passed,
        ledgerPageNo: d.ledgerPageNo,
      })),
    }));

    return {
      rows: mapped,
      totals: {
        planned: mapped.filter((m) => m.status === "planned").length,
        completed: mapped.filter((m) => m.status === "completed").length,
        decisions: mapped.reduce((sum, m) => sum + m.decisions.length, 0),
      },
    };
  }
}
