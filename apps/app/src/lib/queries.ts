import { and, count, desc, eq, gte, isNull, lt, sql, sum } from "drizzle-orm";

import { currentPeriod, periodKey, type Kurus } from "@yonetim/core";
import {
  announcements, debts, expenses, maintenanceRecords, payments, requests, units, withTenant,
} from "@yonetim/db";

import type { AppContext } from "./context";

/** Panel özet verileri — SPEC Bölüm 6.13. */
export interface DashboardSummary {
  unitCount: number;
  totalDebtKurus: Kurus;
  overdueDebtKurus: Kurus;
  collectedThisMonthKurus: Kurus;
  accruedThisMonthKurus: Kurus;
  collectionRate: number;
  expenseThisMonthKurus: Kurus;
  openRequests: number;
  slaBreached: number;
  upcomingMaintenance: number;
  lastAnnouncement: { title: string; publishedAt: Date | null } | null;
}

export async function getDashboardSummary(ctx: AppContext): Promise<DashboardSummary> {
  const period = periodKey(currentPeriod());
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);

  return withTenant(ctx.tenantId, async (tx) => {
    const [unitRow] = await tx
      .select({ value: count() })
      .from(units)
      .where(isNull(units.deletedAt));

    const [debtRow] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.dueDate} < now() THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
      })
      .from(debts)
      .where(and(isNull(debts.deletedAt), sql`${debts.status} <> 'paid'`));

    const [accrualRow] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${debts.amountKurus}), 0)` })
      .from(debts)
      .where(and(eq(debts.period, period), isNull(debts.deletedAt)));

    const [paymentRow] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)` })
      .from(payments)
      .where(and(eq(payments.status, "completed"), gte(payments.paidAt, monthStart)));

    const [expenseRow] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${expenses.amountKurus}), 0)` })
      .from(expenses)
      .where(and(gte(expenses.expenseDate, monthStart), isNull(expenses.deletedAt)));

    const [requestRow] = await tx
      .select({
        open: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} IN ('open','assigned','in_progress'))`,
        breached: sql<number>`COUNT(*) FILTER (WHERE ${requests.slaDueAt} < now() AND ${requests.resolvedAt} IS NULL)`,
      })
      .from(requests)
      .where(isNull(requests.deletedAt));

    const [maintRow] = await tx
      .select({ value: count() })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.isActive, true),
          lt(maintenanceRecords.nextDueAt, in30Days),
          isNull(maintenanceRecords.deletedAt),
        ),
      );

    const [announcement] = await tx
      .select({ title: announcements.title, publishedAt: announcements.publishedAt })
      .from(announcements)
      .where(isNull(announcements.deletedAt))
      .orderBy(desc(announcements.publishedAt))
      .limit(1);

    const accrued = Number(accrualRow?.total ?? 0);
    const collected = Number(paymentRow?.total ?? 0);

    return {
      unitCount: unitRow?.value ?? 0,
      totalDebtKurus: Number(debtRow?.total ?? 0),
      overdueDebtKurus: Number(debtRow?.overdue ?? 0),
      collectedThisMonthKurus: collected,
      accruedThisMonthKurus: accrued,
      collectionRate: accrued > 0 ? Math.min(1, collected / accrued) : 0,
      expenseThisMonthKurus: Number(expenseRow?.total ?? 0),
      openRequests: Number(requestRow?.open ?? 0),
      slaBreached: Number(requestRow?.breached ?? 0),
      upcomingMaintenance: maintRow?.value ?? 0,
      lastAnnouncement: announcement ?? null,
    };
  });
}

/** Daire bazlı borç listesi (tahsilat ekranı). */
export async function getUnitDebtSummary(ctx: AppContext) {
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute<{
      unit_id: string;
      number: string;
      block_name: string | null;
      outstanding: number;
      overdue: number;
      oldest_due: Date | null;
      debt_count: number;
    }>(sql`
      SELECT u.id AS unit_id,
             u.number,
             b.name AS block_name,
             COALESCE(SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus), 0)::bigint AS outstanding,
             COALESCE(SUM(CASE WHEN d.due_date < now()
                          THEN d.amount_kurus + d.late_fee_kurus - d.paid_kurus ELSE 0 END), 0)::bigint AS overdue,
             MIN(d.due_date) FILTER (WHERE d.status <> 'paid') AS oldest_due,
             COUNT(d.id) FILTER (WHERE d.status <> 'paid')::int AS debt_count
      FROM units u
      LEFT JOIN blocks b ON b.id = u.block_id
      LEFT JOIN debts d ON d.unit_id = u.id AND d.deleted_at IS NULL AND d.status <> 'paid'
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.number, b.name
      ORDER BY outstanding DESC, u.number
    `);
    return rows as unknown as {
      unit_id: string;
      number: string;
      block_name: string | null;
      outstanding: number;
      overdue: number;
      oldest_due: Date | null;
      debt_count: number;
    }[];
  });
}

/** Sakin portalı: kendi borçları (debt:read_own). */
export async function getResidentDebts(ctx: AppContext, userId: string) {
  return withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select()
      .from(debts)
      .where(and(eq(debts.debtorUserId, userId), isNull(debts.deletedAt)))
      .orderBy(desc(debts.dueDate));
  });
}

export { sum, count };
