"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { duesPlanRunResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  decimalField,
  errorState,
  intField,
  kurusField,
  okState,
  optionalText,
  periodField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Aidat planı CRUD — GAP 4.1.3 ("Aidat planı (duesPlan) ekleme").
 *
 * Plan, tekrar eden borçlandırmanın **şablonu**dur: periyot, formül, vade günü,
 * gecikme oranı ve kapsam. Cron her dönem başında aktif planları çalıştırır
 * (`dues_runs` tablosu idempotanslığı garanti eder).
 *
 * GECİKME ORANI KARARI (GAP Q4 — "günlük mü aylık mı?"):
 * Varsayılan **aylık**. Gerekçe: KMK md.20 aylık %5 üst sınırı koyuyor ve
 * yönetim planlarının ezici çoğunluğu bu dili kullanıyor. Günlük hesap
 * `lateFeeDailyMode` ile açılır; açıldığında aylık oran 30'a bölünerek
 * uygulanır, yani üst sınır aşılmaz.
 *
 * MIMARI-PLAN §8.5 sonrası: doğrulama burada (alan bazlı hata için), plan
 * kaydı ve arşivleme `apps/api`'de. Worker da aynı planları okuyacak (Track B1).
 */

const FORMULAS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
  "mixed",
  "custom",
] as const;
const PERIODS = [
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
  "one_time",
] as const;

const planSchema = z
  .object({
    id: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      uuidField.optional(),
    ),
    name: requiredText(3, 120),
    period: z.enum(PERIODS, {
      errorMap: () => ({ message: V.invalidSelection }),
    }),
    formula: z.enum(FORMULAS, {
      errorMap: () => ({ message: V.invalidSelection }),
    }),
    /** equal formülünde birim başı tutar. */
    baseAmountKurus: kurusField({ min: 0 }),
    /** Diğer formüllerde dağıtılacak havuz. */
    totalAmountKurus: kurusField({ min: 0 }),
    /** mixed formülünde eşit payın ağırlığı (%); kalan arsa payına gider. */
    mixEqualPct: intField({ min: 0, max: 100 }),
    dueDayOfMonth: intField({ min: 1, max: 28 }),
    lateFeeMonthlyPct: decimalField({ min: 0, max: 5 }),
    lateFeeDailyMode: checkboxField,
    startPeriod: periodField,
    endPeriod: z.preprocess(
      (value) =>
        value === "" || value === null || value === undefined
          ? undefined
          : value,
      z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod)
        .optional(),
    ),
    /** Boş = tüm bloklar. */
    blockIds: z.preprocess(
      (value) => (Array.isArray(value) ? value : value ? [value] : []),
      z.array(z.string().uuid()).default([]),
    ),
    unitTypes: z.preprocess(
      (value) => (Array.isArray(value) ? value : value ? [value] : []),
      z.array(z.string()).default([]),
    ),
    isActive: checkboxField,
    notes: optionalText(1000),
  })
  .refine(
    (data) =>
      data.formula === "equal"
        ? data.baseAmountKurus > 0
        : data.totalAmountKurus > 0,
    // Hangi tutar alanının zorunlu olduğu formüle bağlı; şema düzeyinde
    // yakalamak, formda iki alanı da zorunlu göstermekten daha doğru.
    { message: V.invalidAmount, path: ["baseAmountKurus"] },
  );

export async function saveDuesPlan(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "dues:write",
      schema: planSchema,
      meta: { action: "dues_plan_saved", resource: "dues_plan" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.duesPlans");

      if (input.endPeriod && input.endPeriod < input.startPeriod) {
        return errorState(t("periodRangeInvalid"), {
          endPeriod: [t("periodRangeInvalid")],
        });
      }

      const { id } = await apiPost(
        "/v1/panel/dues-plans",
        {
          id: input.id,
          name: input.name,
          period: input.period,
          formula: input.formula,
          baseAmountMinor: input.baseAmountKurus,
          totalAmountMinor: input.totalAmountKurus,
          mixEqualPct: input.mixEqualPct,
          dueDayOfMonth: input.dueDayOfMonth,
          lateFeeMonthlyPct: input.lateFeeMonthlyPct ?? null,
          lateFeeDailyMode: input.lateFeeDailyMode,
          startPeriod: input.startPeriod,
          endPeriod: input.endPeriod ?? null,
          blockIds: input.blockIds,
          unitTypes: input.unitTypes,
          isActive: input.isActive,
          notes: input.notes ?? null,
        },
        z.object({ id: z.string().uuid() }),
      );

      revalidatePath("/panel/aidat");

      return okState(t("saved", { name: input.name }), {
        redirectTo: "/panel/aidat",
        data: { id },
      });
    },
  );
}

/** Planı aktif/pasif yapar. Silmek yerine pasifleştirmek geçmişi korur. */
export async function toggleDuesPlan(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean; message: string }> {
  await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");

  await apiPatch(`/v1/panel/dues-plans/${id}/status`, { isActive }, null);

  revalidatePath("/panel/aidat");
  return { ok: true, message: isActive ? t("activated") : t("deactivated") };
}

/**
 * Planı arşivler (soft-delete).
 *
 * Üretilmiş borçlar silinmez: plan silinse de o borçların dayanağı kalır.
 * `dues_plan_id` alanı `set null` ile boşalmaz — borç kaydı planı referans
 * almaya devam eder ve detay ekranında "hangi plandan doğdu" görünür.
 */
export async function archiveDuesPlan(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");

  await apiDelete(`/v1/panel/dues-plans/${id}`);

  revalidatePath("/panel/aidat");
  return { ok: true, message: t("archived") };
}

/* ------------------------------------------------------------------ *
 * Planı elle çalıştırma — PROJE-DURUMU §5.4
 * ------------------------------------------------------------------ */

const runSchema = z.object({
  id: uuidField,
  period: periodField,
  /**
   * Gönder butonunun `value`'su: "Önizle" boş bırakıyor, "Uygula" işaretliyor.
   * İki ayrı eylem yazmak yerine tek eylem + niyet bayrağı, önizlemenin ve
   * uygulamanın **aynı** kodu izlemesini garanti ediyor.
   */
  apply: checkboxField,
});

export interface DuesRunState {
  period: string;
  dryRun: boolean;
  generated: number;
  totalKurus: number;
  skipped: boolean;
  reason: string | null;
  fellBackToEqual: boolean;
}

/**
 * Aidat planını şimdi çalıştır.
 *
 * NEDEN VAR: plan bugüne kadar yalnız worker'ın cron'uyla, kendi takviminde
 * çalışıyordu. Ayın ortasında kurulan bir sitede yönetici bir sonraki ayı
 * beklemek zorunda kalıyor ve aynı borçları toplu borçlandırmadan elle
 * giriyordu — yani plan hiç kullanılmıyordu (PROJE-DURUMU §5.4).
 *
 * Üretim mantığı `apps/api` üzerinden `packages/jobs`'taki **aynı** fonksiyona
 * gidiyor; ikinci bir uygulama, elle çalıştırmayla cron'un ayrışması demekti.
 */
export async function runDuesPlan(
  _previous: ActionState<DuesRunState>,
  formData: FormData,
): Promise<ActionState<DuesRunState>> {
  return runAction(
    {
      permission: "dues:write",
      schema: runSchema,
      meta: { action: "dues_plan_run", resource: "dues_plan" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.duesPlans");

      const result = await apiPost(
        `/v1/panel/dues-plans/${input.id}/run`,
        { period: input.period, dryRun: !input.apply },
        duesPlanRunResult,
      );

      if (input.apply) {
        revalidatePath("/panel/aidat");
        revalidatePath("/panel/borclar");
        revalidatePath("/panel");
      }

      const data: DuesRunState = {
        period: result.period,
        dryRun: result.dryRun,
        generated: result.generated,
        totalKurus: result.totalMinor,
        skipped: result.skipped,
        reason: result.reason,
        fellBackToEqual: result.fellBackToEqual,
      };

      if (result.skipped) {
        // Atlanmak bir hata değil: dönem plan aralığının dışında olabilir ya
        // da bu dönem zaten üretilmiş olabilir. Sebebi sunucudan geliyor.
        return okState(result.reason ?? t("runSkipped"), { data });
      }

      return okState(
        result.dryRun
          ? t("runPreview", {
              count: result.generated,
              total: (result.totalMinor / 100).toFixed(2),
            })
          : t("runApplied", {
              count: result.generated,
              total: (result.totalMinor / 100).toFixed(2),
            }),
        { data },
      );
    },
  );
}
