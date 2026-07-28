import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import type {
  DecisionBookQuery,
  DecisionBookResponse,
  DecisionEntryCreate,
  DecisionEntryCreateResult,
} from "@yonetim/contracts";
import { decisionBookEntries, meetings, users } from "@yonetim/db";

import { AuditService } from "../audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Karar Defteri — KMK md.32.
 *
 * Sınıfın tamamı tek bir ilkeye göre yazıldı: **defter ekleme-yalnızdır.**
 * Güncelleme ve silme metodu yok; veritabanı trigger'ı da bunu ayrıca
 * engelliyor (`0006_decision_book.sql`). Yanlış yazılan karar düzeltilmez,
 * düzelten yeni bir karar yazılır ve eskisine işaret eder.
 */
@Injectable()
export class DecisionBookService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(q: DecisionBookQuery): Promise<DecisionBookResponse> {
    const scoped = await this.db.tx(async (tx) => {
      const conditions = [];
      if (q.year !== undefined) {
        // Yıl aralığı `date_trunc` yerine iki sınırla veriliyor ki
        // `idx_decision_book_tenant_date` kullanılabilsin.
        conditions.push(
          gte(decisionBookEntries.decidedAt, new Date(Date.UTC(q.year, 0, 1))),
          lt(decisionBookEntries.decidedAt, new Date(Date.UTC(q.year + 1, 0, 1))),
        );
      }
      if (q.kind) conditions.push(eq(decisionBookEntries.kind, q.kind));

      const [rows, yearRows, meetingRows, maxRow] = await Promise.all([
        tx
          .select({
            id: decisionBookEntries.id,
            entryNo: decisionBookEntries.entryNo,
            decidedAt: decisionBookEntries.decidedAt,
            kind: decisionBookEntries.kind,
            meetingId: decisionBookEntries.meetingId,
            meetingTitle: meetings.title,
            subject: decisionBookEntries.subject,
            body: decisionBookEntries.body,
            quorumRule: decisionBookEntries.quorumRule,
            votesFor: decisionBookEntries.votesFor,
            votesAgainst: decisionBookEntries.votesAgainst,
            abstentions: decisionBookEntries.abstentions,
            passed: decisionBookEntries.passed,
            correctsEntryId: decisionBookEntries.correctsEntryId,
            bookPageNo: decisionBookEntries.bookPageNo,
            createdBy: decisionBookEntries.createdBy,
            createdAt: decisionBookEntries.createdAt,
          })
          .from(decisionBookEntries)
          .leftJoin(meetings, eq(meetings.id, decisionBookEntries.meetingId))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          // Defter en yeni karardan geriye okunuyor; numara sıralaması
          // tarihle aynı yönde çünkü numara zaman sırasıyla veriliyor.
          .orderBy(desc(decisionBookEntries.entryNo)),

        tx
          .selectDistinct({
            year: sql<number>`EXTRACT(YEAR FROM ${decisionBookEntries.decidedAt})::int`,
          })
          .from(decisionBookEntries),

        tx
          .select({
            id: meetings.id,
            title: meetings.title,
            scheduledAt: meetings.scheduledAt,
          })
          .from(meetings)
          .where(isNull(meetings.deletedAt))
          .orderBy(desc(meetings.scheduledAt))
          .limit(100),

        tx
          .select({ value: sql<number>`COALESCE(MAX(${decisionBookEntries.entryNo}), 0)` })
          .from(decisionBookEntries),
      ]);

      return { rows, yearRows, meetingRows, nextEntryNo: Number(maxRow[0]?.value ?? 0) + 1 };
    });

    // "Bu karar sonradan düzeltildi mi" — ters yön. Tek turda kuruluyor:
    // her satır için ayrı sorgu N+1 olurdu ve defter yıllar içinde büyüyor.
    const correctedBy = new Map<string, number>();
    for (const row of scoped.rows) {
      if (row.correctsEntryId) correctedBy.set(row.correctsEntryId, row.entryNo);
    }

    const names = await this.namesOf(scoped.rows.map((row) => row.createdBy));

    return {
      rows: scoped.rows.map((row) => ({
        id: row.id,
        entryNo: row.entryNo,
        decidedAt: row.decidedAt,
        kind: row.kind,
        meetingId: row.meetingId,
        meetingTitle: row.meetingTitle,
        subject: row.subject,
        body: row.body,
        quorumRule: row.quorumRule,
        votesFor: row.votesFor,
        votesAgainst: row.votesAgainst,
        abstentions: row.abstentions,
        passed: row.passed,
        correctsEntryId: row.correctsEntryId,
        correctedByEntryNo: correctedBy.get(row.id) ?? null,
        bookPageNo: row.bookPageNo,
        createdByName: names(row.createdBy),
        createdAt: row.createdAt,
      })),
      years: scoped.yearRows
        .map((row) => Number(row.year))
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => b - a),
      meetings: scoped.meetingRows,
      totals: {
        entries: scoped.rows.length,
        passed: scoped.rows.filter((row) => row.passed).length,
        rejected: scoped.rows.filter((row) => !row.passed).length,
        corrected: correctedBy.size,
      },
      nextEntryNo: scoped.nextEntryNo,
    };
  }

  /**
   * Deftere karar yazar.
   *
   * NUMARA SUNUCUDA VE **ÇAKIŞMAYA DAYANIKLI**: iki yönetici aynı anda kayıt
   * açarsa `MAX(entry_no) + 1` ikisi için de aynı değeri üretir. Tekil index
   * ikincisini reddediyor; burada yeniden deneniyor. Alternatif bir dizi
   * (sequence) kullanmaktı ama sequence boşluk bırakır ve defterde atlanan
   * numara yırtılmış sayfa gibi okunur.
   */
  async create(dto: DecisionEntryCreate): Promise<DecisionEntryCreateResult> {
    if (dto.correctsEntryId) {
      const exists = await this.db.tx(async (tx) =>
        tx
          .select({ id: decisionBookEntries.id })
          .from(decisionBookEntries)
          .where(eq(decisionBookEntries.id, dto.correctsEntryId!))
          .limit(1),
      );
      if (exists.length === 0) throw new NotFoundException("not_found");
    }

    const ctx = this.db.ctx();
    const values = {
      tenantId: ctx.tenantId,
      decidedAt: dto.decidedAt,
      kind: dto.kind,
      meetingId: dto.meetingId ?? null,
      subject: dto.subject,
      body: dto.body,
      quorumRule: dto.quorumRule,
      // Virgül ondalık ayırıcı olarak geliyor olabilir; Postgres nokta bekliyor.
      votesFor: dto.votesFor.replace(",", "."),
      votesAgainst: dto.votesAgainst.replace(",", "."),
      abstentions: dto.abstentions.replace(",", "."),
      passed: dto.passed,
      correctsEntryId: dto.correctsEntryId ?? null,
      bookPageNo: dto.bookPageNo ?? null,
      createdBy: ctx.userId,
    };

    const created = await this.insertWithRetry(values);

    await this.audit.record({
      action: "decision_book_entry_created",
      resource: "decision_book_entry",
      resourceId: created.id,
      reason: dto.correctsEntryId
        ? `${created.entryNo} sayılı karar, önceki bir kararı düzeltiyor`
        : `${created.entryNo} sayılı karar deftere işlendi`,
    });

    return created;
  }

  /** Numara çakışmasında yeniden dener; üç denemede olmuyorsa hata verir. */
  private async insertWithRetry(
    values: Omit<typeof decisionBookEntries.$inferInsert, "entryNo">,
    attempt = 0,
  ): Promise<DecisionEntryCreateResult> {
    const MAX_ATTEMPTS = 3;
    try {
      return await this.db.tx(async (tx) => {
        const [maxRow] = await tx
          .select({
            value: sql<number>`COALESCE(MAX(${decisionBookEntries.entryNo}), 0)`,
          })
          .from(decisionBookEntries);
        const entryNo = Number(maxRow?.value ?? 0) + 1;

        const [row] = await tx
          .insert(decisionBookEntries)
          .values({ ...values, entryNo })
          .returning({
            id: decisionBookEntries.id,
            entryNo: decisionBookEntries.entryNo,
          });
        if (!row) throw new BadRequestException("internal");
        return row;
      });
    } catch (error) {
      // Yalnız tekil index çakışmasında yeniden dene; başka hata olduğu gibi
      // yukarı çıksın — sessizce yutulan bir hata defteri bozuk bırakırdı.
      const message = error instanceof Error ? error.message : "";
      const isDuplicate = message.includes("idx_decision_book_tenant_no");
      if (!isDuplicate || attempt + 1 >= MAX_ATTEMPTS) throw error;
      return this.insertWithRetry(values, attempt + 1);
    }
  }

  /**
   * Kararı yazan kişilerin adı `users` tablosunda (RLS kapsamı dışında);
   * yalnız listede gerçekten geçen kimlikler için dar kapsamlı bypass.
   */
  private async namesOf(
    ids: (string | null)[],
  ): Promise<(id: string | null) => string | null> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return () => null;

    const people = await this.db.bypass("decision-book:people", async (tx) =>
      tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, unique)),
    );

    const byId = new Map(
      people.map((p) => [
        p.id,
        [p.firstName, p.lastName].filter(Boolean).join(" ") || null,
      ]),
    );
    return (id) => (id ? (byId.get(id) ?? null) : null);
  }
}
