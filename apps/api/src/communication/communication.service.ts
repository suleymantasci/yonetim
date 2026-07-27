import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  AnnouncementCreate,
  AnnouncementCreateResult,
  AnnouncementListResponse,
  MeetingListResponse,
  MessageListResponse,
  PollListResponse,
} from "@yonetim/contracts";

import { filterContent, requiresIndividualDelivery } from "@yonetim/kvkk";

import { AuditService } from "../governance/audit/audit.service";
import { CommunicationRepository } from "./communication.repository";

/** `communication` iş akışı — MIMARI-PLAN §8.5, §9a. */
@Injectable()
export class CommunicationService {
  constructor(
    private readonly repo: CommunicationRepository,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
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

  async messages(): Promise<MessageListResponse> {
    const rows = await this.repo.messages();

    const mapped = rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      direction: r.direction,
      body: r.body,
      intent: r.intent,
      intentConfidence: r.intentConfidence,
      handledByBot: r.handledByBot,
      createdAt: r.createdAt,
    }));

    const inbound = mapped.filter((m) => m.direction === "in");
    const botHandled = inbound.filter((m) => m.handledByBot);

    return {
      rows: mapped,
      totals: {
        inbound: inbound.length,
        botHandled: botHandled.length,
        needsHuman: inbound.length - botHandled.length,
        botRatePct:
          inbound.length > 0
            ? Math.round((botHandled.length / inbound.length) * 100)
            : 0,
      },
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
