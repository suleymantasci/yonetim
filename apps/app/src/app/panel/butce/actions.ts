"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { BUDGET_FORMULAS, budgetWriteResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import {
  errorState,
  intField,
  okState,
  optionalText,
  periodField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/** Aynı adlı alanlar dizi olarak gelir; boş değerler **atılmaz** (satır hizası). */
const list = z.preprocess(
  (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]),
  z.array(z.string()),
);

const budgetSchema = z.object({
  id: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    uuidField.optional(),
  ),
  name: requiredText(3, 160),
  startPeriod: periodField,
  endPeriod: periodField,
  formula: z.enum(BUDGET_FORMULAS),
  mixEqualPct: intField({ min: 0, max: 100 }).default(50),
  reservePct: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(String(v).replace(",", "."))),
    z.number().min(0).max(50),
  ),
  notes: optionalText(2000),
  lineLabel: list,
  lineSource: list,
  lineAmount: list,
});

export async function saveBudget(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "dues:write",
      schema: budgetSchema,
      meta: { action: "budget_saved", resource: "operating_budget" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.budget");
      const lines = input.lineLabel
        .map((label, i) => ({
          label: label.trim(),
          source: input.lineSource[i] ?? "",
          plannedMinor: Number(input.lineAmount[i] ?? 0) || 0,
        }))
        // Tutarı girilmemiş öneri kalemleri kaydedilmez: projede 0 TL'lik
        // satırlar genel kurula giden belgeyi kalabalıklaştırıyordu.
        .filter((l) => l.plannedMinor > 0);
      if (lines.length === 0)
        return errorState(t("noLines"), { lineAmount: [t("noLines")] });
      if (lines.some((l) => l.label.length < 2))
        return errorState(t("lineLabelRequired"), {
          lineLabel: [t("lineLabelRequired")],
        });
      if (input.startPeriod > input.endPeriod)
        return errorState(t("periodOrder"), { endPeriod: [t("periodOrder")] });

      const body = {
        name: input.name,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
        formula: input.formula,
        mixEqualPct: input.mixEqualPct,
        reservePct: input.reservePct,
        notes: input.notes ?? null,
        lines,
      };
      const result = input.id
        ? await apiPatch(
            `/v1/panel/budgets/${input.id}`,
            body,
            budgetWriteResult,
          )
        : await apiPost("/v1/panel/budgets", body, budgetWriteResult);
      return okState(t("saved"), {
        data: { id: result.id },
        redirectTo: `/panel/butce/${result.id}`,
      });
    },
  );
}

const approveSchema = z.object({ id: uuidField, note: requiredText(3, 500) });

export async function approveBudget(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "dues:write",
      schema: approveSchema,
      meta: { action: "budget_approved", resource: "operating_budget" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.budget");
      await apiPost(
        `/v1/panel/budgets/${input.id}/approve`,
        { note: input.note },
        budgetWriteResult,
      );
      return okState(t("approved"));
    },
  );
}

const duesSchema = z.object({
  id: uuidField,
  dueDayOfMonth: intField({ min: 1, max: 28 }),
});

export async function createDuesPlanFromBudget(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "dues:write",
      schema: duesSchema,
      meta: { action: "budget_dues_plan", resource: "operating_budget" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.budget");
      await apiPost(
        `/v1/panel/budgets/${input.id}/dues-plan`,
        { dueDayOfMonth: input.dueDayOfMonth },
        z.object({ id: z.string(), duesPlanId: z.string() }),
      );
      return okState(t("duesPlanCreated"));
    },
  );
}

const idSchema = z.object({ id: uuidField });

export async function deleteBudget(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "dues:write",
      schema: idSchema,
      meta: { action: "budget_deleted", resource: "operating_budget" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.budget");
      await apiDelete(`/v1/panel/budgets/${input.id}`);
      return okState(t("deleted"), { redirectTo: "/panel/butce" });
    },
  );
}
