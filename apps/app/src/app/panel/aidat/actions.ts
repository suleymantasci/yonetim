"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { duesPlans, withTenant } from "@yonetim/db";

import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/context";
import {
  ActionError, checkboxField, decimalField, errorState, intField, kurusField, okState,
  optionalText, periodField, requiredText, runAction, uuidField, V, type ActionState,
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
 */

const FORMULAS = ["equal", "land_share", "area", "person_count", "meter", "mixed", "custom"] as const;
const PERIODS = ["monthly", "quarterly", "semiannual", "yearly", "one_time"] as const;

const planSchema = z
  .object({
    id: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      uuidField.optional(),
    ),
    name: requiredText(3, 120),
    period: z.enum(PERIODS, { errorMap: () => ({ message: V.invalidSelection }) }),
    formula: z.enum(FORMULAS, { errorMap: () => ({ message: V.invalidSelection }) }),
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
      (value) => (value === "" || value === null || value === undefined ? undefined : value),
      z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod).optional(),
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
      data.formula === "equal" ? data.baseAmountKurus > 0 : data.totalAmountKurus > 0,
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
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.duesPlans");

      if (input.endPeriod && input.endPeriod < input.startPeriod) {
        return errorState(t("periodRangeInvalid"), {
          endPeriod: [t("periodRangeInvalid")],
        });
      }

      const values = {
        tenantId: ctx.tenantId,
        name: input.name,
        period: input.period,
        formula: input.formula,
        baseAmountKurus: input.formula === "equal" ? input.baseAmountKurus : 0,
        totalAmountKurus: input.formula === "equal" ? 0 : input.totalAmountKurus,
        mixWeights:
          input.formula === "mixed"
            ? { equal: input.mixEqualPct, land_share: 100 - input.mixEqualPct }
            : {},
        dueDayOfMonth: input.dueDayOfMonth,
        appliesTo: {
          blockIds: input.blockIds,
          unitTypes: input.unitTypes,
          notes: input.notes ?? null,
        },
        lateFeeMonthlyPct: (input.lateFeeMonthlyPct ?? 5).toFixed(2),
        lateFeeDailyMode: input.lateFeeDailyMode,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod ?? null,
        isActive: input.isActive,
        createdBy: ctx.userId,
      };

      const id = await withTenant(
        ctx.tenantId,
        async (tx) => {
          if (input.id) {
            await tx.update(duesPlans).set(values).where(eq(duesPlans.id, input.id));
            return input.id;
          }
          const [row] = await tx.insert(duesPlans).values(values).returning({ id: duesPlans.id });
          if (!row) throw new ActionError(t("saveFailed"));
          return row.id;
        },
        { userId: ctx.userId },
      );

      setResourceId(id);
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
  const ctx = await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");

  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx.update(duesPlans).set({ isActive }).where(eq(duesPlans.id, id));
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: isActive ? "dues_plan_activated" : "dues_plan_deactivated",
    resource: "dues_plan",
    resourceId: id,
  });
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
export async function archiveDuesPlan(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");

  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .update(duesPlans)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(duesPlans.id, id));
    },
    { userId: ctx.userId },
  );

  await audit(ctx, { action: "dues_plan_archived", resource: "dues_plan", resourceId: id });
  revalidatePath("/panel/aidat");
  return { ok: true, message: t("archived") };
}
