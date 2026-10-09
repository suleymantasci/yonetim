"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  decimalField,
  intField,
  kurusField,
  okState,
  optionalUuidField,
  reasonMessage,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod);
const schema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), uuidField.optional()),
  description: requiredText(3, 240),
  categoryId: optionalUuidField,
  payee: z.string().optional(),
  amountKurus: kurusField({ min: 1 }),
  vatRate: decimalField({ min: 0, max: 1 }),
  dayOfMonth: intField({ min: 1, max: 28 }),
  startPeriod: period,
  endPeriod: z.preprocess((v) => (v === "" ? undefined : v), period.optional()),
  isActive: checkboxField,
});

/** `payee`: "v:<id>" firma, "s:<id>" personel, boş: yok. */
export async function saveRecurring(_p: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "expense:write", schema, meta: { action: "recurring_expense_saved", resource: "recurring_expense" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.recurring");
      const payee = input.payee ?? "";
      const body = {
        description: input.description,
        categoryId: input.categoryId ?? null,
        vendorId: payee.startsWith("v:") ? payee.slice(2) : null,
        staffId: payee.startsWith("s:") ? payee.slice(2) : null,
        amountMinor: input.amountKurus,
        vatRate: input.vatRate ?? 0.2,
        dayOfMonth: input.dayOfMonth,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod ?? null,
        isActive: input.isActive,
      };
      const idOnly = z.object({ id: z.string().uuid() });
      if (input.id) await apiPatch(`/v1/panel/payables/recurring/${input.id}`, body, idOnly);
      else await apiPost("/v1/panel/payables/recurring", body, idOnly);
      return okState(t("saved"));
    },
  );
}

export async function runRecurring(id: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("expense:write");
  const t = await getTranslations("app.recurring");
  try {
    const r = await apiPost(`/v1/panel/payables/recurring/${id}/run`, {}, z.object({ created: z.number() }));
    return { ok: true, message: t("ran", { count: r.created }) };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("failed") };
  }
}

export async function deleteRecurring(id: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("expense:write");
  const t = await getTranslations("app.recurring");
  try {
    await apiDelete(`/v1/panel/payables/recurring/${id}`);
    return { ok: true, message: t("deleted") };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("failed") };
  }
}
