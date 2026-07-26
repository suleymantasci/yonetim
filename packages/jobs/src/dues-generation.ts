import { and, eq, isNull, or, sql } from "drizzle-orm";

import { currentPeriod, dueDateFor, formatPeriod, parsePeriodKey, periodKey, type Period } from "@yonetim/core";
import { debts, duesPlans, duesRuns, units, withTenant, type Database } from "@yonetim/db";
import { distributeDues, type DuesFormula, type UnitForDues } from "@yonetim/dues";

/**
 * Otomatik aylık borç üretimi — SPEC Bölüm 6.1, Faz 3.
 * Her ayın 1'i 03:00'te çalışır. `dues_runs` üzerindeki (plan, dönem) tekil
 * indeksi sayesinde **idempotent**tir: aynı dönem iki kez üretilmez.
 */
export interface GenerationResult {
  planId: string;
  period: string;
  generated: number;
  totalKurus: number;
  skipped: boolean;
  reason?: string;
  fellBackToEqual: boolean;
}

export async function generateDuesForTenant(params: {
  tenantId: string;
  period?: Period;
  userId?: string;
  /** Test/önizleme: DB'ye yazmadan sonucu döner. */
  dryRun?: boolean;
}): Promise<GenerationResult[]> {
  const period = params.period ?? currentPeriod();
  const pKey = periodKey(period);

  return withTenant(params.tenantId, async (tx) => {
    const plans = await tx
      .select()
      .from(duesPlans)
      .where(and(eq(duesPlans.isActive, true), isNull(duesPlans.deletedAt)));

    const unitRows = await tx
      .select()
      .from(units)
      .where(isNull(units.deletedAt));

    const results: GenerationResult[] = [];

    for (const plan of plans) {
      if (!isPeriodInPlanRange(plan.startPeriod, plan.endPeriod, period)) {
        results.push({
          planId: plan.id,
          period: pKey,
          generated: 0,
          totalKurus: 0,
          skipped: true,
          reason: "Dönem plan aralığı dışında",
          fellBackToEqual: false,
        });
        continue;
      }
      if (!isPeriodDue(plan.period, plan.startPeriod, period)) {
        results.push({
          planId: plan.id,
          period: pKey,
          generated: 0,
          totalKurus: 0,
          skipped: true,
          reason: `${plan.period} periyodunda bu ay tahakkuk yok`,
          fellBackToEqual: false,
        });
        continue;
      }

      const existing = await tx
        .select({ id: duesRuns.id })
        .from(duesRuns)
        .where(and(eq(duesRuns.duesPlanId, plan.id), eq(duesRuns.period, pKey)))
        .limit(1);

      if (existing.length > 0) {
        results.push({
          planId: plan.id,
          period: pKey,
          generated: 0,
          totalKurus: 0,
          skipped: true,
          reason: "Bu dönem zaten üretilmiş (idempotent)",
          fellBackToEqual: false,
        });
        continue;
      }

      const applicable = filterUnits(unitRows, plan.appliesTo as Record<string, unknown>);
      const forDues: UnitForDues[] = applicable.map((u) => ({
        id: u.id,
        landShare: u.landShare ? Number(u.landShare) : null,
        areaM2: u.areaM2 ? Number(u.areaM2) : null,
        residentCount: u.residentCount,
        multiplier: u.duesMultiplier ? Number(u.duesMultiplier) : 1,
        exempt: u.duesExempt,
      }));

      const distribution = distributeDues({
        formula: plan.formula as DuesFormula,
        baseAmountKurus: plan.baseAmountKurus ?? undefined,
        totalAmountKurus: plan.totalAmountKurus ?? undefined,
        mixWeights: (plan.mixWeights ?? {}) as Record<string, number>,
        units: forDues,
      });

      const due = dueDateFor(period, plan.dueDayOfMonth);
      const positives = distribution.shares.filter((s) => s.amountKurus > 0);

      if (params.dryRun) {
        results.push({
          planId: plan.id,
          period: pKey,
          generated: positives.length,
          totalKurus: distribution.totalKurus,
          skipped: false,
          fellBackToEqual: distribution.fellBackToEqual,
        });
        continue;
      }

      /*
       * Yarış koşulu koruması: yukarıdaki SELECT ile bu INSERT arasında başka bir
       * çalıştırıcı aynı dönemi üretmiş olabilir (cron'un iki kez tetiklenmesi,
       * elle çalıştırma vb.). Tekil indeks son sözü söyler; çakışma hata değil,
       * "zaten üretilmiş" anlamına gelir.
       */
      const [run] = await tx
        .insert(duesRuns)
        .values({
          tenantId: params.tenantId,
          duesPlanId: plan.id,
          period: pKey,
          generatedCount: positives.length,
          totalKurus: distribution.totalKurus,
          status: "completed",
        })
        .onConflictDoNothing({ target: [duesRuns.duesPlanId, duesRuns.period] })
        .returning({ id: duesRuns.id });

      if (!run) {
        results.push({
          planId: plan.id,
          period: pKey,
          generated: 0,
          totalKurus: 0,
          skipped: true,
          reason: "Bu dönem eşzamanlı başka bir çalıştırma tarafından üretildi (idempotent)",
          fellBackToEqual: false,
        });
        continue;
      }

      if (positives.length > 0) {
        await tx.insert(debts).values(
          positives.map((s) => {
            const unit = applicable.find((u) => u.id === s.unitId)!;
            return {
              tenantId: params.tenantId,
              unitId: s.unitId,
              debtorUserId: unit.currentTenantId ?? unit.currentOwnerId ?? null,
              duesPlanId: plan.id,
              duesRunId: run.id,
              kind: "dues" as const,
              period: pKey,
              description: `${plan.name} — ${formatPeriod(period)}`,
              amountKurus: s.amountKurus,
              dueDate: due,
              status: "pending" as const,
            };
          }),
        );
      }

      results.push({
        planId: plan.id,
        period: pKey,
        generated: positives.length,
        totalKurus: distribution.totalKurus,
        skipped: false,
        fellBackToEqual: distribution.fellBackToEqual,
      });
    }

    return results;
  }, { userId: params.userId });
}

function isPeriodInPlanRange(start: string, end: string | null, period: Period): boolean {
  const s = parsePeriodKey(start);
  if (!s) return false;
  const key = period.year * 12 + period.month;
  const startKey = s.year * 12 + s.month;
  if (key < startKey) return false;
  if (end) {
    const e = parsePeriodKey(end);
    if (e && key > e.year * 12 + e.month) return false;
  }
  return true;
}

/** Dönemsel planlarda (3/6/12 aylık) bu ay tahakkuk düşüyor mu? */
function isPeriodDue(planPeriod: string, startPeriod: string, period: Period): boolean {
  if (planPeriod === "monthly") return true;
  if (planPeriod === "one_time") {
    return periodKey(period) === startPeriod;
  }
  const s = parsePeriodKey(startPeriod);
  if (!s) return false;
  const diff = period.year * 12 + period.month - (s.year * 12 + s.month);
  const step = planPeriod === "quarterly" ? 3 : planPeriod === "semiannual" ? 6 : 12;
  return diff >= 0 && diff % step === 0;
}

type UnitRow = typeof units.$inferSelect;

function filterUnits(rows: UnitRow[], appliesTo: Record<string, unknown>): UnitRow[] {
  const blockIds = appliesTo.blockIds as string[] | undefined;
  const types = appliesTo.unitTypes as string[] | undefined;
  return rows.filter((u) => {
    if (blockIds?.length && (!u.blockId || !blockIds.includes(u.blockId))) return false;
    if (types?.length && !types.includes(u.type)) return false;
    return true;
  });
}

/** Tüm aktif tenant'lar için çalıştırılır (cron girişi). */
export async function generateDuesForAllTenants(
  db: Database,
  period?: Period,
): Promise<{ tenantId: string; results: GenerationResult[] }[]> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM tenants WHERE status IN ('trial','active','past_due') AND deleted_at IS NULL`,
  );
  const out: { tenantId: string; results: GenerationResult[] }[] = [];
  for (const row of rows as unknown as { id: string }[]) {
    out.push({
      tenantId: row.id,
      results: await generateDuesForTenant({ tenantId: row.id, period }),
    });
  }
  return out;
}

export { or };
