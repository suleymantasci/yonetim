import { Injectable } from "@nestjs/common";
import { desc, eq, isNull, sql } from "drizzle-orm";

import {
  announcements,
  meetingDecisions,
  meetings,
  messages,
  pollVotes,
  polls,
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

  async messages(limit = 150) {
    return this.db.tx(async (tx) =>
      tx.select().from(messages).orderBy(desc(messages.createdAt)).limit(limit),
    );
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
