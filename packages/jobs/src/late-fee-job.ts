import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import { debts, tenants, withTenant } from "@yonetim/db";
import { calculateLateFee } from "@yonetim/dues";

/**
 * Gecikme tazminatı işleme — SPEC Bölüm 6.1 (KMK md.20, aylık %5).
 * Günlük çalışır; her borcun tazminatı **baştan** hesaplanır (birikimli hata olmaz).
 */
export interface LateFeeJobResult {
  tenantId: string;
  processed: number;
  totalFeeKurus: number;
  markedOverdue: number;
}

export async function applyLateFees(params: {
  tenantId: string;
  asOf?: Date;
}): Promise<LateFeeJobResult> {
  const asOf = params.asOf ?? new Date();

  return withTenant(params.tenantId, async (tx) => {
    const settingsRows = await tx
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .limit(1);

    const settings = (settingsRows[0]?.settings ?? {}) as {
      lateFeeEnabled?: boolean;
      lateFeeMonthlyPct?: number;
      lateFeeGraceDays?: number;
    };

    if (settings.lateFeeEnabled === false) {
      return { tenantId: params.tenantId, processed: 0, totalFeeKurus: 0, markedOverdue: 0 };
    }

    const overdue = await tx
      .select()
      .from(debts)
      .where(
        and(
          lt(debts.dueDate, asOf),
          inArray(debts.status, ["pending", "partial", "overdue"]),
          isNull(debts.deletedAt),
        ),
      );

    let totalFee = 0;
    let markedOverdue = 0;

    for (const debt of overdue) {
      const principal = debt.amountKurus - Math.min(debt.paidKurus, debt.amountKurus);
      if (principal <= 0) continue;

      const fee = calculateLateFee({
        principalKurus: principal,
        dueDate: debt.dueDate,
        asOf,
        mode: "kmk_monthly",
        monthlyPct: settings.lateFeeMonthlyPct ?? siteConfig.dues.monthlyLateFeePct,
        graceDays: settings.lateFeeGraceDays ?? 0,
      });

      const newStatus = debt.status === "partial" ? "partial" : "overdue";
      if (debt.status !== "overdue" && debt.status !== "partial") markedOverdue++;

      if (fee.feeKurus !== debt.lateFeeKurus || debt.status !== newStatus) {
        await tx
          .update(debts)
          .set({
            lateFeeKurus: fee.feeKurus,
            lateFeeCalculatedAt: asOf,
            status: newStatus,
          })
          .where(eq(debts.id, debt.id));
      }
      totalFee += fee.feeKurus;
    }

    return {
      tenantId: params.tenantId,
      processed: overdue.length,
      totalFeeKurus: totalFee,
      markedOverdue,
    };
  });
}

/** 90+ gün gecikmiş borçları icra akışına aday olarak listeler (Bölüm 3.5). */
export async function findLegalActionCandidates(tenantId: string, asOf = new Date()) {
  const threshold = new Date(
    asOf.getTime() - siteConfig.dues.legalActionThresholdDays * 86_400_000,
  );

  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      unit_id: string;
      debtor_user_id: string | null;
      total_kurus: number;
      oldest_due: Date;
      debt_count: number;
    }>(sql`
      SELECT unit_id,
             debtor_user_id,
             SUM(amount_kurus + late_fee_kurus - paid_kurus)::bigint AS total_kurus,
             MIN(due_date) AS oldest_due,
             COUNT(*)::int AS debt_count
      FROM debts
      WHERE due_date < ${threshold.toISOString()}::timestamptz
        AND status IN ('pending','partial','overdue')
        AND deleted_at IS NULL
      GROUP BY unit_id, debtor_user_id
      HAVING SUM(amount_kurus + late_fee_kurus - paid_kurus) > 0
      ORDER BY total_kurus DESC
    `);
    return rows as unknown as {
      unit_id: string;
      debtor_user_id: string | null;
      total_kurus: number;
      oldest_due: Date;
      debt_count: number;
    }[];
  });
}
