"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { DEBT_TYPE_DEBTORS, DEBT_TYPE_LATE_FEE_MODES } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  decimalField,
  intField,
  okState,
  reasonMessage,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/** Borç türü tanımları — `/v1/panel/debt-types` köprüsü. */
const BASE_KINDS = [
  "dues",
  "utility",
  "extra",
  "rent",
  "deposit",
  "penalty",
  "admin_fine",
  "reservation",
  "legal_cost",
] as const;

const schema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  name: requiredText(2, 60),
  baseKind: z.enum(BASE_KINDS, { errorMap: () => ({ message: V.invalidSelection }) }),
  debtor: z.enum(DEBT_TYPE_DEBTORS, { errorMap: () => ({ message: V.invalidSelection }) }),
  lateFeeMode: z.enum(DEBT_TYPE_LATE_FEE_MODES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  lateFeeMonthlyPct: decimalField({ min: 0, max: 5 }),
  accountCode: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || undefined : value),
    z.string().regex(/^6\d{2}(\.\d{1,3})?$/, V.invalidAccountCode).optional(),
  ),
  isActive: checkboxField,
  sortOrder: intField({ min: 0, max: 999 }),
});

export async function saveDebtType(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "settings:write",
      schema,
      meta: { action: "debt_type_saved", resource: "debt_type" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.debtTypes");
      const body = {
        name: input.name,
        baseKind: input.baseKind,
        debtor: input.debtor,
        lateFeeMode: input.lateFeeMode,
        lateFeeMonthlyPct: input.lateFeeMonthlyPct ?? null,
        accountCode: input.accountCode ?? null,
        isActive: input.isActive,
        sortOrder: input.sortOrder ?? 0,
      };
      const idOnly = z.object({ id: z.string().uuid() });
      const result = input.id
        ? await apiPatch(`/v1/panel/debt-types/${input.id}`, body, idOnly)
        : await apiPost("/v1/panel/debt-types", body, idOnly);
      return okState(t("saved", { name: input.name }), { data: { id: result.id } });
    },
  );
}

export async function deleteDebtType(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  await requirePermission("settings:write");
  const t = await getTranslations("app.debtTypes");
  try {
    await apiDelete(`/v1/panel/debt-types/${id}`);
    return { ok: true, message: t("deleted") };
  } catch (error) {
    const reason = await reasonMessage(error);
    if (reason) return { ok: false, message: reason };
    throw error;
  }
}
