import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DebtListQuery, DebtListResponse } from "@yonetim/contracts";
import { TREND_MONTHS, toPageMeta } from "@yonetim/contracts";
import {
  blocks,
  debtChanges,
  debts,
  duesPlans,
  paymentAllocations,
  payments,
  unitOrder,
  units,
  users,
} from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Borç repository — SQL yalnız burada (MIMARI-PLAN §8.5).
 *
 * `apps/app/src/lib/queries/debts.ts`'ten birebir taşındı; değişen tek şey
 * `withTenant`/`withBypassRls` yerine `DbService` ve kuruş alanlarının
 * sözleşme adlarına (`*Minor`) çevrilmesi.
 */
/**
 * `unitSummary` ham sorgusunun satır biçimi.
 *
 * Sürücü `bigint`i **metin** olarak veriyor (64-bit tam sayı JS `number`'ına
 * her zaman sığmadığı için); dönüşüm tek yerde, `Number()` ile yapılıyor.
 * `trend` dizisi de aynı sebeple `string[]`.
 */
interface UnitSummarySqlRow extends Record<string, unknown> {
  unit_id: string;
  number: string;
  block_name: string | null;
  outstanding: string;
  overdue: string;
  oldest_due: string | null;
  debt_count: number;
  trend: string[] | null;
}

/**
 * `unit` burada yok: daire numarası metin kolonu ve ham metin sırası
 * `1, 10, 11, … 2` veriyor. Blok + doğal sıra `unitOrder()` ile kuruluyor.
 */
const SORT_COLUMNS = {
  dueDate: debts.dueDate,
  amount: debts.amountKurus,
  period: debts.period,
  status: debts.status,
  createdAt: debts.createdAt,
} as const;

@Injectable()
export class DebtRepository {
  constructor(private readonly db: DbService) {}

  async list(q: DebtListQuery): Promise<DebtListResponse> {
    const scoped = await this.db.tx(async (tx) => {
      const where = this.listWhere(q);
      const orderColumn = SORT_COLUMNS[q.sort as keyof typeof SORT_COLUMNS];
      const orderBy = orderColumn
        ? [q.dir === "asc" ? asc(orderColumn) : desc(orderColumn)]
        : q.sort === "unit"
          ? unitOrder(q.dir)
          : [desc(debts.dueDate)];

      const [rows, totalRow, blockRows, periodRows, totals] = await Promise.all(
        [
          tx
            .select({
              id: debts.id,
              unitId: debts.unitId,
              unitNumber: units.number,
              blockName: blocks.name,
              debtorUserId: debts.debtorUserId,
              kind: debts.kind,
              description: debts.description,
              period: debts.period,
              amountMinor: debts.amountKurus,
              paidMinor: debts.paidKurus,
              lateFeeMinor: debts.lateFeeKurus,
              dueDate: debts.dueDate,
              status: debts.status,
              lateFeeExempt: debts.lateFeeExempt,
              installmentNo: debts.installmentNo,
              installmentCount: debts.installmentCount,
              // Join'li sorgu olduğu için Drizzle sütunu niteliyor; tek tablolu
              // sorguda aynı desen sessizce yanlış tabloya bağlanırdı (bkz. §A1).
              changeCount: sql<number>`(
              SELECT COUNT(*) FROM audit_debt_changes c WHERE c.debt_id = ${debts.id}
            )`,
            })
            .from(debts)
            .innerJoin(units, eq(units.id, debts.unitId))
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(where)
            .orderBy(...orderBy, asc(debts.id))
            .limit(q.perPage)
            .offset((q.page - 1) * q.perPage),

          tx
            .select({ value: sql<number>`COUNT(*)` })
            .from(debts)
            .innerJoin(units, eq(units.id, debts.unitId))
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(where),

          tx
            .select({ id: blocks.id, name: blocks.name })
            .from(blocks)
            .where(isNull(blocks.deletedAt))
            .orderBy(asc(blocks.sortOrder), asc(blocks.name)),

          tx
            .selectDistinct({ period: debts.period })
            .from(debts)
            .where(
              and(isNull(debts.deletedAt), sql`${debts.period} IS NOT NULL`),
            )
            .orderBy(desc(debts.period))
            .limit(24),

          // Özet toplamlar filtreden bağımsız.
          tx
            .select({
              outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} NOT IN ('paid','written_off')
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
              overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} NOT IN ('paid','written_off') AND ${debts.dueDate} < now()
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
              lateFee: sql<number>`COALESCE(SUM(${debts.lateFeeKurus}), 0)`,
              collected: sql<number>`COALESCE(SUM(${debts.paidKurus}), 0)`,
            })
            .from(debts)
            .where(isNull(debts.deletedAt)),
        ],
      );

      return {
        rows,
        total: Number(totalRow[0]?.value ?? 0),
        blockRows,
        periodRows,
        totals: totals[0],
      };
    });

    const names = await this.namesOf(
      scoped.rows.map((row) => row.debtorUserId),
    );

    return {
      rows: scoped.rows.map((row) => ({
        ...row,
        debtorName: names(row.debtorUserId),
        outstandingMinor: row.amountMinor + row.lateFeeMinor - row.paidMinor,
        changeCount: Number(row.changeCount),
      })),
      meta: toPageMeta(q.page, q.perPage, scoped.total),
      facets: {
        blocks: scoped.blockRows.map((b) => ({ id: b.id, label: b.name })),
        periods: scoped.periodRows
          .map((row) => row.period)
          .filter((period): period is string => period !== null),
      },
      totals: {
        outstandingMinor: Number(scoped.totals?.outstanding ?? 0),
        overdueMinor: Number(scoped.totals?.overdue ?? 0),
        lateFeeMinor: Number(scoped.totals?.lateFee ?? 0),
        collectedMinor: Number(scoped.totals?.collected ?? 0),
      },
    };
  }

  private listWhere(q: DebtListQuery): SQL | undefined {
    const conditions: SQL[] = [isNull(debts.deletedAt)];

    if (q.search) {
      const needle = `%${q.search}%`;
      const search = or(
        ilike(units.number, needle),
        ilike(debts.description, needle),
        ilike(blocks.name, needle),
      );
      if (search) conditions.push(search);
    }
    if (q.blockId) conditions.push(eq(units.blockId, q.blockId));
    if (q.period) conditions.push(eq(debts.period, q.period));
    if (q.kind) conditions.push(sql`${debts.kind}::text = ${q.kind}`);
    if (q.status === "acik") conditions.push(sql`${debts.status} NOT IN ('paid','written_off')`);
    if (q.status === "gecikmis") {
      conditions.push(
        sql`${debts.status} NOT IN ('paid','written_off') AND ${debts.dueDate} < now()`,
      );
    }
    if (q.status === "odendi") conditions.push(eq(debts.status, "paid"));
    if (q.status === "taksit")
      conditions.push(sql`${debts.installmentCount} IS NOT NULL`);

    // "Riskli cari" eşiği — satır bazında kalan borç. Ödenmiş borcun kalanı
    // 0'dır, dolayısıyla eşik verildiğinde `status='paid'` satırları zaten
    // elenir; ayrıca durum koşulu eklemek gerekmiyor.
    if (q.minOutstanding !== undefined && q.minOutstanding > 0) {
      conditions.push(
        sql`${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} >= ${q.minOutstanding}`,
      );
    }

    return and(...conditions);
  }

  /* ---------------------------------------------------------------- *
   * Detay
   * ---------------------------------------------------------------- */

  async detail(debtId: string) {
    const scoped = await this.db.tx(async (tx) => {
      const [debt] = await tx
        .select()
        .from(debts)
        .where(eq(debts.id, debtId))
        .limit(1);
      if (!debt) return null;

      const [unitRows, changeRows, allocationRows, planRows] =
        await Promise.all([
          tx
            .select({
              id: units.id,
              number: units.number,
              blockName: blocks.name,
            })
            .from(units)
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(eq(units.id, debt.unitId))
            .limit(1),

          tx
            .select()
            .from(debtChanges)
            .where(eq(debtChanges.debtId, debtId))
            .orderBy(desc(debtChanges.createdAt)),

          tx
            .select({
              paymentId: payments.id,
              amountMinor: paymentAllocations.amountKurus,
              paidAt: payments.paidAt,
              method: payments.method,
              receiptNo: payments.receiptNo,
              payerUserId: payments.payerUserId,
            })
            .from(paymentAllocations)
            .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
            .where(eq(paymentAllocations.debtId, debtId))
            .orderBy(desc(payments.paidAt)),

          debt.duesPlanId
            ? tx
                .select({ name: duesPlans.name })
                .from(duesPlans)
                .where(eq(duesPlans.id, debt.duesPlanId))
                .limit(1)
            : Promise.resolve([] as { name: string }[]),
        ]);

      // Taksit kardeşleri: aynı birim ve aynı taksit sayısı.
      const siblings =
        debt.installmentCount && debt.installmentCount > 1
          ? await tx
              .select({
                id: debts.id,
                installmentNo: debts.installmentNo,
                amountMinor: debts.amountKurus,
                paidMinor: debts.paidKurus,
                dueDate: debts.dueDate,
                status: debts.status,
              })
              .from(debts)
              .where(
                and(
                  eq(debts.unitId, debt.unitId),
                  eq(debts.installmentCount, debt.installmentCount),
                  isNull(debts.deletedAt),
                ),
              )
              .orderBy(asc(debts.installmentNo))
          : [];

      return {
        debt,
        unit: unitRows[0],
        changeRows,
        allocationRows,
        planName: planRows[0]?.name ?? null,
        siblings,
      };
    });

    if (!scoped) return null;

    const names = await this.namesOf([
      scoped.debt.debtorUserId,
      ...scoped.changeRows.map((row) => row.changedBy),
      ...scoped.allocationRows.map((row) => row.payerUserId),
    ]);

    return { ...scoped, nameOf: names };
  }

  /** Son borç değişiklikleri — GAP 5.2 şeffaflık akışı. */
  async recentChanges(limit: number) {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select({
          id: debtChanges.id,
          debtId: debtChanges.debtId,
          unitId: debtChanges.unitId,
          unitNumber: units.number,
          changeType: debtChanges.changeType,
          oldAmountMinor: debtChanges.oldAmountKurus,
          newAmountMinor: debtChanges.newAmountKurus,
          changedBy: debtChanges.changedBy,
          reason: debtChanges.reason,
          createdAt: debtChanges.createdAt,
        })
        .from(debtChanges)
        .leftJoin(units, eq(units.id, debtChanges.unitId))
        .orderBy(desc(debtChanges.createdAt))
        .limit(limit),
    );

    const names = await this.namesOf(rows.map((row) => row.changedBy));
    return rows.map((row) => ({ ...row, actorName: names(row.changedBy) }));
  }

  /**
   * Daire bazlı borç özeti — borçlar ekranının "daire" sekmesi.
   *
   * Ham SQL bilinçli: `LEFT JOIN` + `FILTER` ile tek turda hem toplam hem
   * gecikmiş hem en eski vade çıkıyor. Query builder ile aynı planı üretmek
   * için üç ayrı sorgu gerekirdi.
   *
   * BAKİYE TRENDİ (rakip incelemesi §4.3): her satır son `TREND_MONTHS` ayın
   * ay sonu bakiyesini de taşıyor. Bu **geçmişin yeniden kurulması**, mevcut
   * bakiyeden türetilemez — borcun doğduğu an (`debts.created_at`) ile
   * tahsilatın yapıldığı an (`payments.paid_at`) ayrı ayrı kesiliyor. Aynı
   * sorguda üretiliyor çünkü daire başına ayrı sorgu, N+1'in tam tanımı olurdu.
   */
  async unitSummary(minOutstanding?: number) {
    // Eşik `HAVING`'e giriyor: kalan borç bir toplam, `WHERE` aşamasında
    // henüz hesaplanmamış oluyor.
    const havingClause =
      minOutstanding !== undefined && minOutstanding > 0
        ? sql`HAVING COALESCE(SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus), 0) >= ${minOutstanding}`
        : sql``;

    return this.db.tx(async (tx) => {
      // Ham `execute` sonucu sürücü tip eşlemesinden geçmiyor: sayısal
      // toplamlar ve `MIN(due_date)` string olarak geliyor. Aşağıda hepsi tek
      // yerde normalleştiriliyor ki uçtan çıkan tarih diğer uçlarla aynı
      // (ISO-8601) biçimde olsun.
      const rows = await tx.execute<UnitSummarySqlRow>(sql`
        WITH months AS (
          -- Her ayın **kesim anı** (üst sınır, hariç). Cari ay için ay sonu
          -- geleceğe düşeceğinden now() ile sınırlanıyor: henüz olmamış bir
          -- ayın bakiyesini göstermek, son noktayı sistematik olarak şişirirdi.
          SELECT gs.idx,
                 LEAST(
                   date_trunc('month', now()) - make_interval(months => gs.idx) + interval '1 month',
                   now()
                 ) AS cutoff
          FROM generate_series(0, ${TREND_MONTHS - 1}) AS gs(idx)
        ),
        charges AS (
          SELECT d.unit_id, m.idx, SUM(d.amount_kurus + d.late_fee_kurus)::bigint AS total
          FROM debts d
          CROSS JOIN months m
          WHERE d.deleted_at IS NULL AND d.created_at < m.cutoff
          GROUP BY d.unit_id, m.idx
        ),
        settled AS (
          -- Tahsilat borcun kendisinden değil, **dağıtımından** okunuyor:
          -- debts.paid_kurus bugünkü durumu taşır, geçmiş bir ay sonunda ne
          -- kadarının ödenmiş olduğunu söylemez.
          SELECT d.unit_id, m.idx, SUM(pa.amount_kurus)::bigint AS total
          FROM payment_allocations pa
          JOIN payments p ON p.id = pa.payment_id
          JOIN debts d ON d.id = pa.debt_id
          CROSS JOIN months m
          WHERE d.deleted_at IS NULL AND p.paid_at < m.cutoff
          GROUP BY d.unit_id, m.idx
        ),
        trend AS (
          -- idx DESC → dizi eskiden yeniye sıralı çıkıyor; grafik x eksenini
          -- ters çevirmek zorunda kalmıyor.
          SELECT u.id AS unit_id,
                 array_agg(
                   (COALESCE(c.total, 0) - COALESCE(s.total, 0))::bigint
                   ORDER BY m.idx DESC
                 ) AS series
          FROM units u
          CROSS JOIN months m
          LEFT JOIN charges c ON c.unit_id = u.id AND c.idx = m.idx
          LEFT JOIN settled s ON s.unit_id = u.id AND s.idx = m.idx
          WHERE u.deleted_at IS NULL
          GROUP BY u.id
        )
        SELECT u.id AS unit_id,
               u.number,
               b.name AS block_name,
               COALESCE(SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus), 0)::bigint AS outstanding,
               COALESCE(SUM(CASE WHEN d.due_date < now()
                            THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::bigint AS overdue,
               MIN(d.due_date) FILTER (WHERE d.status NOT IN ('paid','written_off')) AS oldest_due,
               COUNT(d.id) FILTER (WHERE d.status NOT IN ('paid','written_off'))::int AS debt_count,
               t.series AS trend
        FROM units u
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN debts d ON d.unit_id = u.id AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off')
        LEFT JOIN trend t ON t.unit_id = u.id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id, u.number, b.name, b.sort_order, t.series
        ${havingClause}
        -- Eşit borçta sıra blok → doğal daire numarası. Ham \`u.number\`
        -- metin sırası veriyordu (\`1, 10, 11, … 2\`); \`b.sort_order\` bu
        -- yüzden GROUP BY'a da eklendi.
        ORDER BY outstanding DESC,
                 b.sort_order, b.name,
                 NULLIF(substring(u.number from '[0-9]+'), '')::numeric,
                 u.number
      `);

      return (rows as unknown as UnitSummarySqlRow[]).map((row) => ({
        unitId: row.unit_id,
        number: row.number,
        blockName: row.block_name,
        outstandingMinor: Number(row.outstanding),
        overdueMinor: Number(row.overdue),
        oldestDue: row.oldest_due ? new Date(row.oldest_due) : null,
        debtCount: Number(row.debt_count),
        // Hiç borcu olmamış daire için `array_agg` NULL döner; sözleşme sabit
        // uzunluk vaat ettiği için sıfır serisine indirgeniyor.
        trendMinor: (row.trend ?? []).length
          ? row.trend!.map(Number)
          : new Array<number>(TREND_MONTHS).fill(0),
      }));
    });
  }

  /** Bir birimin açık borçları (tahsilat formu). */
  async openDebtsForUnit(unitId: string) {
    return this.db.tx(async (tx) =>
      tx
        .select({
          id: debts.id,
          description: debts.description,
          period: debts.period,
          amountMinor: debts.amountKurus,
          paidMinor: debts.paidKurus,
          lateFeeMinor: debts.lateFeeKurus,
          dueDate: debts.dueDate,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, unitId),
            isNull(debts.deletedAt),
            sql`${debts.status} NOT IN ('paid','written_off')`,
          ),
        )
        .orderBy(asc(debts.dueDate)),
    );
  }

  /**
   * Kişi adları global `users` tablosunda (RLS kapsamı dışında); yalnız
   * listede gerçekten geçen kimlikler için kontrollü bypass ile okunuyor.
   */
  private async namesOf(
    ids: (string | null)[],
  ): Promise<(id: string | null) => string | null> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return () => null;

    const people = await this.db.bypass("debts:people", async (tx) =>
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
