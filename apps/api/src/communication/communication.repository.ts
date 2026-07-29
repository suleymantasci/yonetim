import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  announcements,
  blocks,
  meetingDecisions,
  meetings,
  messages,
  pollVotes,
  polls,
  unitOccupancies,
  units,
  users,
  type Database,
} from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

/** `communication` okuma sorguları — MIMARI-PLAN §8.5. SQL yalnız burada. */
@Injectable()
export class CommunicationRepository {
  constructor(private readonly db: DbService) {}

  async announcements(limit = 50) {
    return this.db.tx(async (tx) =>
      tx
        .select()
        .from(announcements)
        .where(isNull(announcements.deletedAt))
        .orderBy(desc(announcements.createdAt))
        .limit(limit),
    );
  }

  /**
   * Anketler + oy sayıları.
   *
   * Oy sayısı ayrı bir gruplu sorgudan geliyor: her anket için alt sorgu
   * yazmak, tek tablo sorgusunda Drizzle'ın kolonu niteliksiz üretmesi
   * yüzünden (`"id"` yerine `"polls"."id"`) sessizce yanlış sonuç verirdi.
   */
  async polls(limit = 50) {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(polls)
        .where(isNull(polls.deletedAt))
        .orderBy(desc(polls.createdAt))
        .limit(limit);

      const counts = await tx
        .select({ pollId: pollVotes.pollId, value: sql<number>`COUNT(*)::int` })
        .from(pollVotes)
        .groupBy(pollVotes.pollId);

      return { rows, counts };
    });
  }

  /**
   * Yazışma kütüğü + muhatabın kim olduğu.
   *
   * Kullanıcı adı `leftJoin` ile geliyor: `user_id` boş bir mesaj (tanınmayan
   * numaradan gelen WhatsApp) listeden düşmemeli — yönetici onu da görmeli,
   * yalnız cevaplayamaz.
   */
  async messages(limit = 300) {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          id: messages.id,
          userId: messages.userId,
          channel: messages.channel,
          direction: messages.direction,
          body: messages.body,
          intent: messages.intent,
          intentConfidence: messages.intentConfidence,
          handledByBot: messages.handledByBot,
          createdAt: messages.createdAt,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
        })
        .from(messages)
        .leftJoin(users, eq(users.id, messages.userId))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];

      return { rows, unitLabels: await this.unitLabels(tx, userIds) };
    });
  }

  /** Tek sakinle yazışma. Sakin bulunamazsa `user` yok — servis 404 atar. */
  async messageThread(userId: string, limit = 200) {
    return this.db.tx(async (tx) => {
      const [user] = await tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);

      const rows = await tx
        .select({
          id: messages.id,
          channel: messages.channel,
          direction: messages.direction,
          body: messages.body,
          intent: messages.intent,
          intentConfidence: messages.intentConfidence,
          handledByBot: messages.handledByBot,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.userId, userId))
        .orderBy(messages.createdAt)
        .limit(limit);

      const unitLabels = user ? await this.unitLabels(tx, [userId]) : new Map<string, string>();

      return { user, rows, unitLabels };
    });
  }

  /** `userId` → "A Blok · 9" etiketi. Boş liste için sorgu açılmıyor. */
  private async unitLabels(tx: Database, userIds: string[]) {
    const labels = new Map<string, string>();
    if (userIds.length === 0) return labels;

    const rows = await tx
      .select({
        userId: unitOccupancies.userId,
        number: units.number,
        block: blocks.name,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(
        and(
          inArray(unitOccupancies.userId, userIds),
          isNull(unitOccupancies.endDate),
        ),
      );

    for (const r of rows) {
      const label = [r.block, r.number].filter(Boolean).join(" · ");
      const current = labels.get(r.userId);
      labels.set(r.userId, current ? `${current}, ${label}` : label);
    }
    return labels;
  }

  async meetings(limit = 30) {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(meetings)
        .where(isNull(meetings.deletedAt))
        .orderBy(desc(meetings.scheduledAt))
        .limit(limit);

      const decisions = await tx
        .select()
        .from(meetingDecisions)
        .orderBy(meetingDecisions.decisionNo)
        .limit(500);

      return { rows, decisions };
    });
  }

  /** Duyuru kaydı. Filtre kararı serviste verilir; burada yalnız yazma var. */
  async createAnnouncement(values: {
    title: string;
    body: string;
    audience: string;
    channels: string[];
    isUrgent: boolean;
    publishedAt: Date | null;
    kvkkFlagged: boolean;
    kvkkFindings: unknown;
  }): Promise<string> {
    const ctx = this.db.ctx();
    return this.db.tx(async (tx) => {
      const [row] = await tx
        .insert(announcements)
        .values({
          tenantId: ctx.tenantId,
          title: values.title,
          body: values.body,
          audience: values.audience,
          channels: values.channels,
          isUrgent: values.isUrgent,
          publishedAt: values.publishedAt,
          kvkkFlagged: values.kvkkFlagged,
          kvkkFindings: values.kvkkFindings,
          createdBy: ctx.userId,
        })
        .returning({ id: announcements.id });
      return row!.id;
    });
  }

  /** Duyuru KVKK bulguları — yalnız detayda gösteriliyor. */
  async announcementFindings(id: string) {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ findings: announcements.kvkkFindings })
        .from(announcements)
        .where(eq(announcements.id, id))
        .limit(1);
      return rows[0]?.findings ?? null;
    });
  }
}
