import { and, eq, isNull, sql } from "drizzle-orm";

import { expenses, recurringExpenses, withTenant } from "@yonetim/db";

/**
 * Tekrarlayan faturalar — her tanım için vadesi gelmiş dönemlerin gider
 * kaydını açar (onaylı, ödenmemiş: "ödenecekler" listesine düşer).
 *
 * Kaçırılan aylar da üretilir (iş birkaç gün çalışmadıysa): `last_period`
 * sonrasından bugüne kadar, `day_of_month` günü geçmiş her dönem. Aynı dönem
 * iki kez üretilmez (`uq_expenses_recurring_period`).
 */
export interface RecurringResult {
  tenantId: string;
  created: number;
}

/** Bugün (İstanbul) itibarıyla üretilmesi gereken dönemler — saf fonksiyon. */
export function duePeriods(
  def: { startPeriod: string; endPeriod: string | null; lastPeriod: string | null; dayOfMonth: number },
  now: Date,
): string[] {
  const local = new Date(now.getTime() + 3 * 3_600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  const key = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  // Bu ayın günü geldiyse bu ay dahil, gelmediyse geçen aya kadar.
  let lastDue = d >= def.dayOfMonth ? key(y, m) : m === 1 ? key(y - 1, 12) : key(y, m - 1);
  if (def.endPeriod && def.endPeriod < lastDue) lastDue = def.endPeriod;
  const out: string[] = [];
  let [cy, cm] = def.startPeriod.split("-").map(Number) as [number, number];
  for (let guard = 0; guard < 240; guard++) {
    const k = key(cy, cm);
    if (k > lastDue) break;
    if (!def.lastPeriod || k > def.lastPeriod) out.push(k);
    cm += 1;
    if (cm === 13) {
      cm = 1;
      cy += 1;
    }
  }
  return out;
}

export async function generateRecurringExpenses(params: {
  tenantId: string;
  now?: Date;
  onlyId?: string;
}): Promise<RecurringResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const defs = await tx
      .select()
      .from(recurringExpenses)
      .where(
        and(
          eq(recurringExpenses.isActive, true),
          isNull(recurringExpenses.deletedAt),
          ...(params.onlyId ? [eq(recurringExpenses.id, params.onlyId)] : []),
        ),
      );
    let created = 0;
    for (const def of defs) {
      const periods = duePeriods(def, now);
      if (periods.length === 0) continue;
      for (const period of periods) {
        const vatRate = Number(def.vatRate);
        const rows = await tx
          .insert(expenses)
          .values({
            tenantId: params.tenantId,
            categoryId: def.categoryId,
            vendorId: def.vendorId,
            staffId: def.staffId,
            staffKind: def.staffId ? "salary" : null,
            description: def.description,
            amountKurus: def.amountKurus,
            vatRate: def.vatRate,
            vatKurus: Math.round((def.amountKurus * vatRate) / (1 + vatRate)),
            expenseDate: new Date(`${period}-${String(def.dayOfMonth).padStart(2, "0")}T09:00:00+03:00`),
            period,
            status: "approved",
            recurringId: def.id,
          })
          .onConflictDoNothing()
          .returning({ id: expenses.id });
        created += rows.length;
      }
      await tx
        .update(recurringExpenses)
        .set({ lastPeriod: periods[periods.length - 1]!, updatedAt: sql`now()` })
        .where(eq(recurringExpenses.id, def.id));
    }
    return { tenantId: params.tenantId, created };
  });
}
