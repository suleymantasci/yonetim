import { sql } from "drizzle-orm";

import { withTenant } from "@yonetim/db";

import type { AppContext } from "../context";

/**
 * Dashboard grafik verileri — GAP 4.3.4.
 *
 * KARARLAR:
 *
 * 1. **Tek eksen kuralı.** Gelir-gider aynı grafikte çizilebiliyor çünkü ikisi
 *    de kuruş; tahsilat *oranı* (yüzde) ayrı grafiğe alındı. İki farklı ölçekli
 *    ölçüyü iki y ekseniyle üst üste bindirmek en yaygın grafik hatası ve
 *    okuyucuyu yanıltıyor.
 *
 * 2. **Toplama SQL'de.** 12 aylık kırılım için tüm borç/ödeme satırlarını
 *    çekip JavaScript'te gruplamak, büyük sitede yüz binlerce satır demek.
 *    `date_trunc` + `GROUP BY` Postgres'in işi.
 *
 * 3. **Nakit akışı tahmini deterministik.** Gelecek 6 ay, açık borçların
 *    vadelerinden ve son 6 ayın **gerçekleşmiş tahsilat oranından** türetilir.
 *    Model yok, AI yok (SPEC 9.3: aidat hesabında AI yasak) — sayı nereden
 *    geldiği açıklanabilir olmalı.
 */

export interface MonthlySeries {
  /** "2026-07" biçiminde, kronolojik. */
  periods: string[];
  accruedKurus: number[];
  collectedKurus: number[];
  expenseKurus: number[];
  collectionRatePct: number[];
}

export interface AgingBuckets {
  labels: string[];
  amounts: number[];
}

export interface CashForecast {
  periods: string[];
  /** Gerçekleşen + tahmin; `forecastFrom` indeksinden sonrası tahmin. */
  netKurus: number[];
  forecastFrom: number;
  /** Tahminde kullanılan tarihsel tahsilat oranı (0-1). */
  assumedCollectionRate: number;
}

export interface DashboardCharts {
  monthly: MonthlySeries;
  aging: AgingBuckets;
  forecast: CashForecast;
  /** Tahsilat durumu kırılımı (halka grafiği). */
  collectionSplit: { paidKurus: number; openKurus: number; overdueKurus: number };
}

const MONTHS_BACK = 12;

export async function getDashboardCharts(ctx: AppContext): Promise<DashboardCharts> {
  return withTenant(ctx.tenantId, async (tx) => {
    // Son 12 ay: tahakkuk (borç), tahsilat (ödeme), gider.
    const monthlyRows = await tx.execute<{
      period: string;
      accrued: string;
      collected: string;
      expense: string;
    }>(sql`
      WITH months AS (
        SELECT to_char(month, 'YYYY-MM') AS period, month
        FROM generate_series(
          date_trunc('month', now()) - interval '${sql.raw(String(MONTHS_BACK - 1))} months',
          date_trunc('month', now()),
          interval '1 month'
        ) AS month
      )
      SELECT
        m.period,
        COALESCE((
          SELECT SUM(d.amount_kurus) FROM debts d
          WHERE d.deleted_at IS NULL
            AND date_trunc('month', d.due_date) = m.month
        ), 0)::text AS accrued,
        COALESCE((
          SELECT SUM(p.amount_kurus) FROM payments p
          WHERE p.status = 'completed'
            AND date_trunc('month', p.paid_at) = m.month
        ), 0)::text AS collected,
        COALESCE((
          SELECT SUM(e.amount_kurus) FROM expenses e
          WHERE e.deleted_at IS NULL
            AND date_trunc('month', e.expense_date) = m.month
        ), 0)::text AS expense
      FROM months m
      ORDER BY m.month
    `);

    const rows = monthlyRows as unknown as {
      period: string;
      accrued: string;
      collected: string;
      expense: string;
    }[];

    const monthly: MonthlySeries = {
      periods: rows.map((row) => row.period),
      accruedKurus: rows.map((row) => Number(row.accrued)),
      collectedKurus: rows.map((row) => Number(row.collected)),
      expenseKurus: rows.map((row) => Number(row.expense)),
      collectionRatePct: rows.map((row) => {
        const accrued = Number(row.accrued);
        if (accrued <= 0) return 0;
        // %100'ü aşabilir (geçmiş borçların tahsilatı); grafik doğruyu göstermeli,
        // kırpmak "her şey yolunda" yanılsaması yaratır. 200 üstünü sınırlıyoruz
        // ki tek aylık toplu tahsilat ekseni ezmesin.
        return Math.min(200, Math.round((Number(row.collected) / accrued) * 100));
      }),
    };

    // Gecikme yaşı dağılımı — icra kararının dayanağı.
    const agingRows = await tx.execute<{ bucket: string; total: string }>(sql`
      SELECT
        CASE
          WHEN now() - d.due_date < interval '30 days'  THEN 'd0'
          WHEN now() - d.due_date < interval '60 days'  THEN 'd30'
          WHEN now() - d.due_date < interval '90 days'  THEN 'd60'
          WHEN now() - d.due_date < interval '180 days' THEN 'd90'
          ELSE 'd180'
        END AS bucket,
        SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)::text AS total
      FROM debts d
      WHERE d.deleted_at IS NULL
        AND d.status <> 'paid'
        AND d.due_date < now()
      GROUP BY bucket
    `);

    const agingMap = new Map(
      (agingRows as unknown as { bucket: string; total: string }[]).map((row) => [
        row.bucket,
        Number(row.total),
      ]),
    );
    const agingKeys = ["d0", "d30", "d60", "d90", "d180"] as const;
    const aging: AgingBuckets = {
      labels: [...agingKeys],
      amounts: agingKeys.map((key) => agingMap.get(key) ?? 0),
    };

    // Tahsilat durumu kırılımı.
    const [splitRow] = await tx.execute<{
      paid: string;
      open: string;
      overdue: string;
    }>(sql`
      SELECT
        COALESCE(SUM(d.paid_kurus), 0)::text AS paid,
        COALESCE(SUM(CASE WHEN d.status <> 'paid' AND d.due_date >= now()
          THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::text AS open,
        COALESCE(SUM(CASE WHEN d.status <> 'paid' AND d.due_date < now()
          THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::text AS overdue
      FROM debts d
      WHERE d.deleted_at IS NULL
    `) as unknown as { paid: string; open: string; overdue: string }[];

    // Nakit akışı tahmini: gelecek 6 ayın vadeleri + tarihsel tahsilat oranı.
    const upcomingRows = await tx.execute<{ period: string; due: string; expense: string }>(sql`
      WITH months AS (
        SELECT to_char(month, 'YYYY-MM') AS period, month
        FROM generate_series(
          date_trunc('month', now()) + interval '1 month',
          date_trunc('month', now()) + interval '6 months',
          interval '1 month'
        ) AS month
      )
      SELECT
        m.period,
        COALESCE((
          SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus) FROM debts d
          WHERE d.deleted_at IS NULL AND d.status <> 'paid'
            AND date_trunc('month', d.due_date) = m.month
        ), 0)::text AS due,
        COALESCE((
          -- Tekrarlayan gider tahmini: son 6 ayın aylık ortalaması.
          SELECT AVG(monthly.total) FROM (
            SELECT SUM(e.amount_kurus) AS total
            FROM expenses e
            WHERE e.deleted_at IS NULL
              AND e.expense_date >= now() - interval '6 months'
            GROUP BY date_trunc('month', e.expense_date)
          ) monthly
        ), 0)::text AS expense
      FROM months m
      ORDER BY m.month
    `);

    const upcoming = upcomingRows as unknown as {
      period: string;
      due: string;
      expense: string;
    }[];

    const historicalAccrued = monthly.accruedKurus.slice(-6).reduce((a, b) => a + b, 0);
    const historicalCollected = monthly.collectedKurus.slice(-6).reduce((a, b) => a + b, 0);
    const assumedRate =
      historicalAccrued > 0 ? Math.min(1, historicalCollected / historicalAccrued) : 0.85;

    const historicalNet = monthly.periods.map(
      (_, index) => (monthly.collectedKurus[index] ?? 0) - (monthly.expenseKurus[index] ?? 0),
    );

    const forecast: CashForecast = {
      periods: [...monthly.periods, ...upcoming.map((row) => row.period)],
      netKurus: [
        ...historicalNet,
        ...upcoming.map(
          (row) => Math.round(Number(row.due) * assumedRate) - Number(row.expense),
        ),
      ],
      forecastFrom: monthly.periods.length - 1,
      assumedCollectionRate: assumedRate,
    };

    return {
      monthly,
      aging,
      forecast,
      collectionSplit: {
        paidKurus: Number(splitRow?.paid ?? 0),
        openKurus: Number(splitRow?.open ?? 0),
        overdueKurus: Number(splitRow?.overdue ?? 0),
      },
    };
  });
}

/** Son aktiviteler akışı — dashboard feed'i (GAP 4.3.4). */
export interface ActivityEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: Date;
}

export async function getRecentActivity(
  ctx: AppContext,
  limit = 12,
): Promise<ActivityEntry[]> {
  // Denetim kütüğü `withBypassRls` ile yazılıyor ama tenant kolonu var;
  // okuma tenant kapsamında yapılabilir.
  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx.execute<{
      id: string;
      action: string;
      resource: string;
      resource_id: string | null;
      reason: string | null;
      created_at: Date;
      first_name: string | null;
      last_name: string | null;
    }>(sql`
      SELECT a.id, a.action, a.resource, a.resource_id, a.reason, a.created_at,
             NULL::text AS first_name, NULL::text AS last_name
      FROM audit_logs a
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `),
  );

  return (
    rows as unknown as {
      id: string;
      action: string;
      resource: string;
      resource_id: string | null;
      reason: string | null;
      created_at: Date;
      first_name: string | null;
      last_name: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    // Aktör adı ayrı sorgu gerektiriyor (users RLS dışı); feed için
    // eylemin kendisi yeterli — isim detay ekranında görünüyor.
    actorName: null,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
