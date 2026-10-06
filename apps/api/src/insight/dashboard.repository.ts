import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { currentPeriod, periodKey } from "@yonetim/core";
import {
  announcements,
  auditLogs,
  debts,
  expenses,
  maintenanceRecords,
  payments,
  requests,
  units,
} from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

/** Aylık seride kaç ay geriye bakılıyor. */
const MONTHS_BACK = 12;
/** Tahmin ufku. */
const MONTHS_FORWARD = 6;

/**
 * Kontrol paneli sorguları — MIMARI-PLAN §8.5. SQL yalnız burada.
 *
 * TOPLAMA SQL'DE: 12 aylık kırılım için tüm borç/ödeme satırlarını çekip
 * JavaScript'te gruplamak, büyük sitede yüz binlerce satır demek.
 * `date_trunc` + `GROUP BY` Postgres'in işi.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly db: DbService) {}

  async summary() {
    const period = periodKey(currentPeriod());
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const in30Days = new Date(Date.now() + 30 * 86_400_000);

    return this.db.tx(async (tx) => {
      const [
        [unitRow],
        [debtRow],
        [accrualRow],
        [paymentRow],
        [expenseRow],
        [requestRow],
        [maintRow],
        [announcement],
      ] = await Promise.all([
        tx
          .select({ value: count() })
          .from(units)
          .where(isNull(units.deletedAt)),

        tx
          .select({
            total: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
            overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.dueDate} < now()
              THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
          })
          .from(debts)
          .where(and(isNull(debts.deletedAt), sql`${debts.status} NOT IN ('paid','written_off')`)),

        tx
          .select({
            total: sql<number>`COALESCE(SUM(${debts.amountKurus}), 0)`,
          })
          .from(debts)
          .where(and(eq(debts.period, period), isNull(debts.deletedAt))),

        tx
          .select({
            total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.status, "completed"),
              gte(payments.paidAt, monthStart),
            ),
          ),

        tx
          .select({
            total: sql<number>`COALESCE(SUM(${expenses.amountKurus}), 0)`,
          })
          .from(expenses)
          .where(
            and(
              gte(expenses.expenseDate, monthStart),
              isNull(expenses.deletedAt),
            ),
          ),

        tx
          .select({
            open: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} IN ('open','assigned','in_progress'))`,
            breached: sql<number>`COUNT(*) FILTER (WHERE ${requests.slaDueAt} < now() AND ${requests.resolvedAt} IS NULL)`,
          })
          .from(requests)
          .where(isNull(requests.deletedAt)),

        tx
          .select({ value: count() })
          .from(maintenanceRecords)
          .where(
            and(
              eq(maintenanceRecords.isActive, true),
              lt(maintenanceRecords.nextDueAt, in30Days),
              isNull(maintenanceRecords.deletedAt),
            ),
          ),

        tx
          .select({
            title: announcements.title,
            publishedAt: announcements.publishedAt,
          })
          .from(announcements)
          .where(isNull(announcements.deletedAt))
          .orderBy(desc(announcements.publishedAt))
          .limit(1),
      ]);

      const accrued = Number(accrualRow?.total ?? 0);
      const collected = Number(paymentRow?.total ?? 0);

      return {
        unitCount: unitRow?.value ?? 0,
        totalDebtMinor: Number(debtRow?.total ?? 0),
        overdueDebtMinor: Number(debtRow?.overdue ?? 0),
        collectedThisMonthMinor: collected,
        accruedThisMonthMinor: accrued,
        collectionRate: accrued > 0 ? Math.min(1, collected / accrued) : 0,
        expenseThisMonthMinor: Number(expenseRow?.total ?? 0),
        openRequests: Number(requestRow?.open ?? 0),
        slaBreached: Number(requestRow?.breached ?? 0),
        upcomingMaintenance: maintRow?.value ?? 0,
        lastAnnouncement: announcement ?? null,
      };
    });
  }

  async charts() {
    return this.db.tx(async (tx) => {
      const monthlyRows = (await tx.execute(sql`
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
      `)) as unknown as {
        period: string;
        accrued: string;
        collected: string;
        expense: string;
      }[];

      const monthly = {
        periods: monthlyRows.map((row) => row.period),
        accruedMinor: monthlyRows.map((row) => Number(row.accrued)),
        collectedMinor: monthlyRows.map((row) => Number(row.collected)),
        expenseMinor: monthlyRows.map((row) => Number(row.expense)),
        collectionRatePct: monthlyRows.map((row) => {
          const accrued = Number(row.accrued);
          if (accrued <= 0) return 0;
          return Math.min(
            200,
            Math.round((Number(row.collected) / accrued) * 100),
          );
        }),
      };

      // Gecikme yaşı dağılımı — icra kararının dayanağı.
      const agingRows = (await tx.execute(sql`
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
          AND d.status NOT IN ('paid','written_off')
          AND d.due_date < now()
        GROUP BY bucket
      `)) as unknown as { bucket: string; total: string }[];

      const agingMap = new Map(
        agingRows.map((row) => [row.bucket, Number(row.total)]),
      );
      const agingKeys = ["d0", "d30", "d60", "d90", "d180"] as const;
      const aging = {
        labels: [...agingKeys],
        amounts: agingKeys.map((key) => agingMap.get(key) ?? 0),
      };

      const splitRows = (await tx.execute(sql`
        SELECT
          COALESCE(SUM(d.paid_kurus), 0)::text AS paid,
          COALESCE(SUM(CASE WHEN d.status NOT IN ('paid','written_off') AND d.due_date >= now()
            THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::text AS open,
          COALESCE(SUM(CASE WHEN d.status NOT IN ('paid','written_off') AND d.due_date < now()
            THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::text AS overdue
        FROM debts d
        WHERE d.deleted_at IS NULL
      `)) as unknown as { paid: string; open: string; overdue: string }[];
      const splitRow = splitRows[0];

      const upcoming = (await tx.execute(sql`
        WITH months AS (
          SELECT to_char(month, 'YYYY-MM') AS period, month
          FROM generate_series(
            date_trunc('month', now()) + interval '1 month',
            date_trunc('month', now()) + interval '${sql.raw(String(MONTHS_FORWARD))} months',
            interval '1 month'
          ) AS month
        )
        SELECT
          m.period,
          COALESCE((
            SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus) FROM debts d
            WHERE d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off')
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
      `)) as unknown as { period: string; due: string; expense: string }[];

      // Tahmin dayanağı: son 6 ayın **gerçekleşmiş** tahsilat oranı. Hiç
      // tahakkuk yoksa 0.85 varsayılıyor — sıfır oran "hiç tahsilat olmaz"
      // demek olurdu ve yeni bir sitede tahmini anlamsız kılardı.
      const historicalAccrued = monthly.accruedMinor
        .slice(-6)
        .reduce((a, b) => a + b, 0);
      const historicalCollected = monthly.collectedMinor
        .slice(-6)
        .reduce((a, b) => a + b, 0);
      const assumedRate =
        historicalAccrued > 0
          ? Math.min(1, historicalCollected / historicalAccrued)
          : 0.85;

      const historicalNet = monthly.periods.map(
        (_, index) =>
          (monthly.collectedMinor[index] ?? 0) -
          (monthly.expenseMinor[index] ?? 0),
      );

      return {
        monthly,
        aging,
        forecast: {
          periods: [...monthly.periods, ...upcoming.map((row) => row.period)],
          netMinor: [
            ...historicalNet,
            ...upcoming.map(
              (row) =>
                Math.round(Number(row.due) * assumedRate) - Number(row.expense),
            ),
          ],
          forecastFrom: monthly.periods.length - 1,
          assumedCollectionRate: assumedRate,
        },
        collectionSplit: {
          paidMinor: Number(splitRow?.paid ?? 0),
          openMinor: Number(splitRow?.open ?? 0),
          overdueMinor: Number(splitRow?.overdue ?? 0),
        },
      };
    });
  }

  /**
   * Son aktiviteler akışı.
   *
   * Kütük `bypass` ile yazılıyor ama `tenant_id` kolonu var, dolayısıyla
   * okuma tenant kapsamında yapılabiliyor — baypasa gerek yok.
   */
  async recentActivity(limit: number) {
    return this.db.tx(async (tx) =>
      tx
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          resource: auditLogs.resource,
          resourceId: auditLogs.resourceId,
          reason: auditLogs.reason,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit),
    );
  }
}
