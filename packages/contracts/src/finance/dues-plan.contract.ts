import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Aidat planı sözleşmesi — MIMARI-PLAN §6.4 `dues-plan`.
 *
 * Plan, tekrar eden borçlandırmanın **şablonu**: periyot, formül, vade günü,
 * gecikme oranı ve kapsam. Worker her dönem başında aktif planları çalıştırır
 * (`dues_runs` tablosu idempotanslığı garanti eder — Track B1).
 *
 * GECİKME ORANI (GAP Q4): varsayılan **aylık**, KMK md.20 aylık %5 üst sınırı
 * bunu dayatıyor. Günlük hesap `lateFeeDailyMode` ile açılır ve aylık oran 30'a
 * bölünerek uygulanır, yani üst sınır aşılmaz.
 */

export const DUES_PLAN_FORMULAS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
  "mixed",
  "custom",
] as const;
export const duesPlanFormula = z.enum(DUES_PLAN_FORMULAS);

export const DUES_PLAN_PERIODS = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "one_time",
] as const;
export const duesPlanPeriod = z.enum(DUES_PLAN_PERIODS);

export const duesPlanRow = z.object({
  id: uuid,
  name: z.string(),
  period: z.string(),
  formula: z.string(),
  baseAmountMinor: moneyMinor,
  totalAmountMinor: moneyMinor,
  mixWeights: z.record(z.unknown()),
  dueDayOfMonth: z.number().int(),
  appliesTo: z.record(z.unknown()),
  lateFeeMonthlyPct: z.string(),
  lateFeeDailyMode: z.boolean(),
  startPeriod: z.string(),
  endPeriod: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: dateTime,
});

export type DuesPlanRow = z.infer<typeof duesPlanRow>;

export const duesRunRow = z.object({
  id: uuid,
  duesPlanId: uuid,
  period: z.string(),
  status: z.string(),
  generatedCount: z.number().int(),
  totalMinor: moneyMinor,
  error: z.string().nullable(),
  createdAt: dateTime,
});

export const duesPlanListResponse = z.object({
  plans: z.array(duesPlanRow),
  /** Son çalıştırmalar — planın gerçekten koştuğunu görmek için. */
  runs: z.array(duesRunRow),
});

export type DuesPlanListResponse = z.infer<typeof duesPlanListResponse>;

export const duesPlanSave = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(3).max(120),
    period: duesPlanPeriod,
    formula: duesPlanFormula,
    /** `equal` formülünde birim başı tutar. */
    baseAmountMinor: z.coerce.number().int().min(0).default(0),
    /** Diğer formüllerde dağıtılacak havuz. */
    totalAmountMinor: z.coerce.number().int().min(0).default(0),
    /** `mixed` formülünde eşit payın ağırlığı (%); kalan arsa payına gider. */
    mixEqualPct: z.coerce.number().int().min(0).max(100).default(50),
    dueDayOfMonth: z.coerce.number().int().min(1).max(28),
    lateFeeMonthlyPct: z.coerce.number().min(0).max(5).nullish(),
    lateFeeDailyMode: z.coerce.boolean().default(false),
    startPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    endPeriod: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullish(),
    /** Boş = tüm bloklar. */
    blockIds: z.array(uuid).default([]),
    unitTypes: z.array(z.string()).default([]),
    isActive: z.coerce.boolean().default(true),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine(
    (data) =>
      data.formula === "equal"
        ? data.baseAmountMinor > 0
        : data.totalAmountMinor > 0,
    // Hangi tutar alanının zorunlu olduğu formüle bağlı; şema düzeyinde
    // yakalamak, formda iki alanı da zorunlu göstermekten daha doğru.
    {
      message: "Formüle uygun tutar alanı zorunlu.",
      path: ["baseAmountMinor"],
    },
  )
  .refine((data) => !data.endPeriod || data.endPeriod >= data.startPeriod, {
    message: "Bitiş dönemi başlangıçtan önce olamaz.",
    path: ["endPeriod"],
  });

export type DuesPlanSave = z.infer<typeof duesPlanSave>;

export const duesPlanTogglePatch = z.object({ isActive: z.coerce.boolean() });
