import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, eq, isNull, max, sql } from "drizzle-orm";

import type {
  MeetingDecisionSave,
  MeetingDecisionSaveResult,
  MeetingSave,
  MeetingSaveResult,
  MessageSend,
  MessageSendResult,
  PollClose,
  PollCloseResult,
  PollSave,
  PollSaveResult,
} from "@yonetim/contracts";
import { dispatch, route } from "@yonetim/notifications";

import { consumeMessageCredit } from "./message-credit";
import {
  conversationStates,
  meetingDecisions,
  meetings,
  messages,
  pollVotes,
  polls,
  tenants,
  units,
  users,
} from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

/**
 * Yeter sayı eşikleri — KMK md.31/32.
 *
 * `simple_majority` **katılanların** salt çoğunluğu; diğerleri **tüm kat
 * malikleri** üzerinden hesaplanır. Bu ayrım kanunun kendisi: olağan kararlar
 * toplantıya katılanlarla alınır, nitelikli kararlar (md.42/44 gibi) tüm
 * maliklerin belirli bir oranını ister. Hepsini katılanlar üzerinden
 * hesaplamak, dört kişinin katıldığı bir toplantıda oybirliği kararı almayı
 * mümkün kılardı.
 */
const QUORUM_OF_ALL: Record<string, number> = {
  absolute_majority: 0.5,
  two_thirds: 2 / 3,
  four_fifths: 0.8,
  unanimous: 1,
};

/**
 * Anket / toplantı / mesaj yazma — PROJE-DURUMU §5.2, sıra 6.
 *
 * Üçü tek serviste çünkü üçü de aynı bağlamın (`communication`) parçası ve
 * hiçbiri tek başına ayrı bir repository katmanı gerektirecek hacimde değil
 * — `inventory` ile aynı gerekçe.
 */
@Injectable()
export class CommunicationWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /* ---------------- Anket ---------------- */

  async savePoll(dto: PollSave, id?: string): Promise<PollSaveResult> {
    /*
     * SEÇENEK KİMLİKLERİ SUNUCUDA VE **KORUNARAK** üretiliyor.
     *
     * Oylar `option_id` ile saklanıyor. Düzenlemede kimlikleri baştan üretmek,
     * verilmiş oyları başka bir seçeneğe bağlardı. Bu yüzden mevcut seçenek
     * sırası korunuyor: aynı sıradaki seçenek aynı kimliği tutuyor, yeni
     * eklenenler sıradaki numarayı alıyor.
     */
    const result = await this.db.tx(async (tx) => {
      let previous: { id: string; label: string }[] = [];
      let before: typeof polls.$inferSelect | undefined;

      if (id) {
        const [row] = await tx
          .select()
          .from(polls)
          .where(and(eq(polls.id, id), isNull(polls.deletedAt)))
          .limit(1);
        if (!row) throw new NotFoundException("not_found");
        // Kapanmış oylama düzenlenmiyor: sonucu saklandı ve sorusu değişirse
        // saklanan sonuç neyin sonucu olduğunu söylemez hale gelirdi.
        if (row.closedAt) {
          throw new BadRequestException("invalid:poll_closed");
        }
        before = row;
        previous = Array.isArray(row.options)
          ? (row.options as { id: string; label: string }[])
          : [];
      }

      const options = dto.options.map((label, index) => ({
        id: previous[index]?.id ?? `opt${index + 1}`,
        label,
      }));

      const values = {
        question: dto.question,
        description: dto.description ?? null,
        options,
        weightMode: dto.weightMode,
        quorumRule: dto.quorumRule,
        visibility: dto.visibility,
        allowMultiple: dto.allowMultiple,
        ownersOnly: dto.ownersOnly,
        opensAt: dto.opensAt,
        closesAt: dto.closesAt,
        meetingId: dto.meetingId ?? null,
      };

      if (!id) {
        const [created] = await tx
          .insert(polls)
          .values({
            ...values,
            tenantId: this.db.ctx().tenantId,
            createdBy: this.db.ctx().userId ?? null,
          })
          .returning({ id: polls.id });
        if (!created) throw new NotFoundException("internal");
        return { id: created.id, diff: undefined };
      }

      await tx
        .update(polls)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(polls.id, id));

      return {
        id,
        diff: diffOf(before as unknown as Record<string, unknown>, {
          question: values.question,
          weightMode: values.weightMode,
          quorumRule: values.quorumRule,
          closesAt: values.closesAt,
        }),
      };
    });

    await this.audit.record({
      action: id ? "poll_updated" : "poll_created",
      resource: "poll",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id };
  }

  /**
   * Oylamayı kapat ve sonucu **sakla**.
   *
   * Sonuç `result_json`'a yazılıyor, her okumada yeniden hesaplanmıyor:
   * ağırlık modu ya da arsa payları sonradan değişirse kapanmış bir kararın
   * sonucu değişmemeli. Kapanmış bir oylama artık bir kayıt, bir sorgu değil.
   */
  async closePoll(id: string, dto: PollClose): Promise<PollCloseResult> {
    const outcome = await this.db.tx(async (tx) => {
      const [poll] = await tx
        .select()
        .from(polls)
        .where(and(eq(polls.id, id), isNull(polls.deletedAt)))
        .limit(1);
      if (!poll) throw new NotFoundException("not_found");
      if (poll.closedAt) throw new BadRequestException("invalid:already_closed");

      const options = Array.isArray(poll.options)
        ? (poll.options as { id: string; label: string }[])
        : [];

      const tally = await tx
        .select({
          optionId: pollVotes.optionId,
          votes: count(),
          weight: sql<string>`coalesce(sum(${pollVotes.weight}), 0)`,
        })
        .from(pollVotes)
        .where(eq(pollVotes.pollId, id))
        .groupBy(pollVotes.optionId);

      const byOption = new Map(tally.map((t) => [t.optionId, t] as const));
      const totalVotes = tally.reduce((sum, t) => sum + t.votes, 0);
      const totalWeight = tally.reduce((sum, t) => sum + Number(t.weight), 0);

      // Yeter sayı tabanı: kural "tüm kat malikleri" diyorsa toplam bağımsız
      // bölüm sayısı, demiyorsa oy kullananlar.
      const [unitTotal] = await tx
        .select({ value: count() })
        .from(units)
        .where(isNull(units.deletedAt));
      const allUnits = unitTotal?.value ?? 0;

      const ratioOfAll = QUORUM_OF_ALL[poll.quorumRule];
      const base = ratioOfAll ? allUnits : totalVotes;
      const threshold = ratioOfAll
        ? allUnits * ratioOfAll
        : totalVotes / 2;

      const resultOptions = options.map((opt) => {
        const row = byOption.get(opt.id);
        const votes = row?.votes ?? 0;
        const weight = Number(row?.weight ?? 0);
        // Yüzde **ağırlığa** göre: arsa payı modunda oy sayısı yanıltıcıdır.
        const denominator =
          poll.weightMode === "land_share" ? totalWeight : totalVotes;
        return {
          id: opt.id,
          label: opt.label,
          votes,
          weight: weight.toFixed(6),
          pct: denominator > 0
            ? Math.round(
                ((poll.weightMode === "land_share" ? weight : votes) /
                  denominator) *
                  1000,
              ) / 10
            : 0,
        };
      });

      const leader = [...resultOptions].sort((a, b) =>
        poll.weightMode === "land_share"
          ? Number(b.weight) - Number(a.weight)
          : b.votes - a.votes,
      )[0];

      const leaderValue = leader
        ? poll.weightMode === "land_share"
          ? Number(leader.weight)
          : leader.votes
        : 0;

      /*
       * "Eşitlik kazanan sayılmaz": `>` kullanılıyor, `>=` değil. Salt
       * çoğunluk tanımı gereği yarıdan **fazla**; tam yarı, karar değil
       * beraberliktir ve o durumda karar alınmamış olur.
       */
      const quorumMet = base > 0 && leaderValue > threshold;

      const stored = {
        totalVotes,
        totalWeight: totalWeight.toFixed(6),
        options: resultOptions,
        winnerOptionId: quorumMet ? (leader?.id ?? null) : null,
        quorumMet,
        base,
        threshold,
        closedReason: dto.reason ?? null,
      };

      await tx
        .update(polls)
        .set({
          closedAt: new Date(),
          resultJson: stored,
          updatedAt: new Date(),
        })
        .where(eq(polls.id, id));

      return {
        id,
        totalVotes,
        totalWeight: totalWeight.toFixed(6),
        options: resultOptions,
        winnerOptionId: stored.winnerOptionId,
        quorumMet,
      };
    });

    await this.audit.record({
      action: "poll_closed",
      resource: "poll",
      resourceId: id,
      reason: dto.reason ?? undefined,
      diff: {
        winnerOptionId: { from: null, to: outcome.winnerOptionId },
        quorumMet: { from: null, to: outcome.quorumMet },
      },
    });
    return outcome;
  }

  /* ---------------- Toplantı ---------------- */

  async saveMeeting(
    dto: MeetingSave,
    id?: string,
  ): Promise<MeetingSaveResult> {
    const values = {
      title: dto.title,
      kind: dto.kind,
      scheduledAt: dto.scheduledAt,
      secondCallAt: dto.secondCallAt ?? null,
      location: dto.location ?? null,
      onlineUrl: dto.onlineUrl ?? null,
      agenda: dto.agenda,
      status: dto.status,
      minutesUrl: dto.minutesUrl ?? null,
    };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(meetings)
          .values({
            ...values,
            tenantId: this.db.ctx().tenantId,
            createdBy: this.db.ctx().userId ?? null,
          })
          .returning({ id: meetings.id, title: meetings.title });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(meetings)
        .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(meetings)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(meetings.id, id));

      return {
        id,
        title: dto.title,
        diff: diffOf(before as unknown as Record<string, unknown>, {
          title: values.title,
          scheduledAt: values.scheduledAt,
          status: values.status,
        }),
      };
    });

    await this.audit.record({
      action: id ? "meeting_updated" : "meeting_created",
      resource: "meeting",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, title: result.title };
  }

  /**
   * Toplantı kararı ekle.
   *
   * KARAR NUMARASI SUNUCUDA: toplantı içinde sürekli ve tekil olmalı
   * (`idx_decisions_meeting_no`). İstemciye bırakmak, aynı toplantıya iki
   * kişinin aynı numarayı yazmasına izin verirdi.
   *
   * NOT — bu **karar defteri değil**. Site geneli sürekli numaralı,
   * değiştirilemez defter `decision_book_entries` (§2.7); buradaki numara
   * tutanağın kendi sırasıdır ve tutanak düzeltilebilir.
   */
  async addMeetingDecision(
    meetingId: string,
    dto: MeetingDecisionSave,
  ): Promise<MeetingDecisionSaveResult> {
    const result = await this.db.tx(async (tx) => {
      const [meeting] = await tx
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
        .limit(1);
      if (!meeting) throw new NotFoundException("not_found");

      const [last] = await tx
        .select({ value: max(meetingDecisions.decisionNo) })
        .from(meetingDecisions)
        .where(eq(meetingDecisions.meetingId, meetingId));
      const decisionNo = (last?.value ?? 0) + 1;

      const [created] = await tx
        .insert(meetingDecisions)
        .values({
          tenantId: this.db.ctx().tenantId,
          meetingId,
          decisionNo,
          title: dto.title,
          body: dto.body,
          quorumRule: dto.quorumRule,
          votesFor: String(dto.votesFor),
          votesAgainst: String(dto.votesAgainst),
          abstentions: String(dto.abstentions),
          passed: dto.passed,
          ledgerPageNo: dto.ledgerPageNo ?? null,
        })
        .returning({ id: meetingDecisions.id });
      if (!created) throw new NotFoundException("internal");

      return { id: created.id, decisionNo };
    });

    await this.audit.record({
      action: "meeting_decision_added",
      resource: "meeting_decision",
      resourceId: result.id,
    });
    return result;
  }

  /* ---------------- Mesaj ---------------- */

  /**
   * Tek kişiye mesaj.
   *
   * DUYURUDAN FARKI MUHATAP: duyuru kitleye, mesaj bir kişiye gider. Duyuru
   * akışındaki KVKK toplu-kanal filtresi burada gerekmiyor (bir kişinin
   * borcunu ona söylemek ihlal değil); buradaki risk tersine yanlış kişiye
   * gönderim ve o, alıcı seçiminin kendisiyle çözülüyor.
   *
   * GÖNDERİM ENGELLENİRSE KAYIT YİNE **AÇILIYOR** (`queued: false`): "mesaj
   * göndermeye çalıştık ama numara yok" bilgisi, hiç kayıt olmamasından daha
   * kullanışlı — yönetici neden ulaşamadığını görebiliyor.
   */
  async sendMessage(dto: MessageSend): Promise<MessageSendResult> {
    const prepared = await this.db.tx(async (tx) => {
      const [user] = await tx
        .select({
          id: users.id,
          phone: users.phone,
          email: users.email,
          whatsappOptIn: users.whatsappOptIn,
        })
        .from(users)
        .where(and(eq(users.id, dto.userId), isNull(users.deletedAt)))
        .limit(1);
      if (!user) throw new NotFoundException("not_found");

      // 24 saatlik servis penceresi konuşma durumunda tutuluyor; serbest metin
      // ancak pencere açıkken gönderilebiliyor (Meta kuralı).
      const [state] = user.phone
        ? await tx
            .select({
              serviceWindowEndsAt: conversationStates.serviceWindowEndsAt,
              optedOutAt: conversationStates.optedOutAt,
            })
            .from(conversationStates)
            .where(eq(conversationStates.phone, user.phone))
            .limit(1)
        : [undefined];

      return { user, state };
    });

    const { user, state } = prepared;

    if (state?.optedOutAt) {
      return this.recordOutbound(dto, "in_app", false, "opted_out");
    }
    if (dto.channel !== "in_app" && !user.phone) {
      return this.recordOutbound(dto, "in_app", false, "no_phone");
    }

    if (dto.channel === "in_app") {
      return this.recordOutbound(dto, "in_app", true, null);
    }

    // Demo site dışarıya mesaj göndermez (gerçek numara girilmiş olsa bile).
    const [site] = await this.db.tx((tx) =>
      tx.select({ isDemo: tenants.isDemo }).from(tenants).where(eq(tenants.id, this.db.ctx().tenantId)).limit(1),
    );
    if (site?.isDemo) {
      return this.recordOutbound(dto, "in_app", false, "demo_tenant");
    }

    const decision = route({
      kind: "manual_message",
      recipient: {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        whatsappOptIn: user.whatsappOptIn,
        // `users` tablosunda pazarlama izni yok — o izin İYS kapsamında ve
        // ayrı tutuluyor. Elle yazılan yönetim mesajı zaten pazarlama değil;
        // `false` vermek yönlendirmeyi doğru tarafta bırakıyor.
        marketingOptIn: false,
        hasAppSession: false,
      },
      serviceWindowEndsAt: state?.serviceWindowEndsAt ?? null,
    });

    /*
     * Serbest metin yalnız pencere içinde gönderilebiliyor. Dışarıdaysa
     * mesaj **gönderilmiyor** ve sebebi dönüyor: onaylı bir şablona
     * sığmayan serbest metni şablon gibi göndermek Meta tarafında reddedilir
     * ve yöneticiye "gitti" demek yanlış olurdu.
     */
    if (!decision.useFreeform) {
      return this.recordOutbound(dto, "in_app", false, "window_closed");
    }

    const outcomes = await dispatch(
      decision,
      { phone: user.phone, email: user.email },
      {
        templateName: decision.templateName,
        templateParams: [],
        freeformText: dto.body,
      },
    );
    const sent = outcomes.find((o) => o.ok);

    // Yöneticinin elle yazdığı mesaj da kredi tüketiyor (aşım dahil: açık
    // gönderim kararı yöneticide).
    if (sent && (sent.channel === "sms" || sent.channel === "whatsapp")) {
      const channel = sent.channel;
      await this.db.tx((tx) => consumeMessageCredit(tx, this.db.ctx().tenantId, channel));
    }

    return this.recordOutbound(
      dto,
      sent?.channel ?? "in_app",
      Boolean(sent),
      sent ? null : (outcomes[0]?.error ?? "send_failed"),
    );
  }

  /** Giden mesajı `messages` günlüğüne yazar ve denetim kaydını üretir. */
  private async recordOutbound(
    dto: MessageSend,
    channel: string,
    queued: boolean,
    blockedReason: string | null,
  ): Promise<MessageSendResult> {
    const id = await this.db.tx(async (tx) => {
      const [created] = await tx
        .insert(messages)
        .values({
          tenantId: this.db.ctx().tenantId,
          userId: dto.userId,
          channel: channel as "whatsapp" | "sms" | "email" | "in_app" | "push",
          direction: "out",
          body: dto.body,
          handledByBot: false,
          meta: { sentBy: this.db.ctx().userId, blockedReason },
        })
        .returning({ id: messages.id });
      if (!created) throw new NotFoundException("internal");
      return created.id;
    });

    await this.audit.record({
      action: queued ? "message_sent" : "message_send_blocked",
      resource: "message",
      resourceId: id,
      reason: blockedReason ?? undefined,
    });

    return { id, channel, queued, blockedReason };
  }
}
