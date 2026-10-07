import { z } from "zod";

import { dateTime, moneyMinor, periodKey, uuid } from "../_shared/fields";

/**
 * İşletme projesi (KMK 37) — `/v1/panel/budgets/*`.
 *
 * Dönem bütçesi: gider kalemleri + yedek pay. Toplam, seçilen formülle
 * (arsa payı varsayılan, KMK 20) bağımsız bölümlere dağıtılır ve aylık avans
 * hesaplanır. Onaylanan proje kilitlenir (genel kurul kararı); aidat planına
 * dönüştürülünce aylık borçlandırma o plandan yürür.
 *
 * Gerçekleşen: dönem içindeki onaylı/ödenmiş giderler, kalemin gider
 * kategorisine göre. Kategorisiz kalem yalnız plan olarak görünür.
 */

export const BUDGET_FORMULAS = [
  "land_share",
  "area",
  "equal",
  "mixed",
] as const;
export const budgetFormula = z.enum(BUDGET_FORMULAS);

/** Kalemin gerçekleşen kaynağı: gider kategorisi id'si, "staff" ya da boş. */
export const BUDGET_STAFF_KEY = "staff";

export const budgetLineInput = z.object({
  source: z
    .union([uuid, z.literal(BUDGET_STAFF_KEY), z.literal("")])
    .default(""),
  label: z.string().trim().min(2).max(160),
  plannedMinor: z.coerce.number().int().min(0).max(100_000_000_000),
});

export const budgetSave = z
  .object({
    name: z.string().trim().min(3).max(160),
    startPeriod: periodKey,
    endPeriod: periodKey,
    formula: budgetFormula.default("land_share"),
    mixEqualPct: z.coerce.number().int().min(0).max(100).default(50),
    reservePct: z.coerce.number().min(0).max(50).default(0),
    notes: z.string().trim().max(2000).nullish(),
    lines: z.array(budgetLineInput).min(1).max(100),
  })
  .refine((v) => v.startPeriod <= v.endPeriod, {
    message: "period_order",
    path: ["endPeriod"],
  })
  .refine((v) => monthsBetween(v.startPeriod, v.endPeriod) <= 24, {
    message: "period_too_long",
    path: ["endPeriod"],
  });
export type BudgetSave = z.infer<typeof budgetSave>;

export const budgetApprove = z.object({
  /** Genel kurul tarihi / karar no gibi serbest metin. */
  note: z.string().trim().min(3).max(500),
});
export type BudgetApprove = z.infer<typeof budgetApprove>;

export const budgetToDuesPlan = z.object({
  dueDayOfMonth: z.coerce.number().int().min(1).max(28).default(10),
});
export type BudgetToDuesPlan = z.infer<typeof budgetToDuesPlan>;

export const budgetRow = z.object({
  id: uuid,
  name: z.string(),
  startPeriod: z.string(),
  endPeriod: z.string(),
  months: z.number().int(),
  formula: z.string(),
  mixEqualPct: z.number().int(),
  reservePct: z.number(),
  status: z.enum(["draft", "approved"]),
  approvedAt: dateTime.nullable(),
  approvalNote: z.string().nullable(),
  duesPlanId: uuid.nullable(),
  notes: z.string().nullable(),
  /** Kalemler toplamı (yedek hariç). */
  linesMinor: moneyMinor,
  /** Kalemler + yedek. */
  totalMinor: moneyMinor,
  monthlyMinor: moneyMinor,
  /** Dönem içinde bugüne kadar gerçekleşen gider. */
  actualMinor: moneyMinor,
  createdAt: dateTime,
});
export type BudgetRow = z.infer<typeof budgetRow>;

export const budgetListResponse = z.object({ rows: z.array(budgetRow) });

export const budgetLineRow = z.object({
  id: uuid,
  categoryId: uuid.nullable(),
  isStaff: z.boolean(),
  /** Gerçekleşen kaynağının adı (kategori ya da "Personel"). */
  sourceName: z.string().nullable(),
  label: z.string(),
  plannedMinor: moneyMinor,
  /** Dönem içinde bugüne kadar (kategori bağlıysa). */
  actualMinor: moneyMinor.nullable(),
  /** Geçen süreye göre beklenen: plan × geçen ay / toplam ay. */
  expectedToDateMinor: moneyMinor,
});

export const budgetUnitShare = z.object({
  unitId: uuid,
  label: z.string(),
  weight: z.number(),
  exempt: z.boolean(),
  monthlyMinor: moneyMinor,
  totalMinor: moneyMinor,
});

export const budgetDetail = z.object({
  budget: budgetRow,
  lines: z.array(budgetLineRow),
  /** Bu döneme denk gelen aktif aidat planı sayısı (çift borçlandırma uyarısı). */
  overlappingDuesPlans: z.number().int(),
  /** Kategoriye bağlanmamış (projede olmayan) gerçekleşen giderler. */
  unplannedActualMinor: moneyMinor,
  reserveMinor: moneyMinor,
  /** Dönemin geçen ay sayısı (0..months). */
  elapsedMonths: z.number().int(),
  shares: z.array(budgetUnitShare),
  fellBackToEqual: z.boolean(),
  categories: z.array(z.object({ id: uuid, name: z.string() })),
});
export type BudgetDetail = z.infer<typeof budgetDetail>;

export const budgetOptions = z.object({
  categories: z.array(z.object({ id: uuid, name: z.string() })),
});

export const budgetWriteResult = z.object({ id: uuid });

export function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey! - sy!) * 12 + (em! - sm!) + 1;
}
