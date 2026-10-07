"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { openingSaveResult } from "@yonetim/contracts";

import { apiPut } from "@/lib/api/server";
import { formToObject, okState, runAction, type ActionState } from "@/lib/form";

/**
 * Açılış fişi kaydı. Form alanları ön ekli: `bank:<id>`, `vendor:<id>`,
 * `staffPayable:<id>`, `staffAdvance:<id>`, `unit:<id>` — değerleri kuruş
 * (MoneyInput gizli alanı). Ayrıştırma burada, doğrulama API'de.
 */
const schema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cash: z.coerce.number().int().min(0).default(0),
});

export async function saveOpening(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "settings:write", schema, meta: { action: "opening_balances_saved", resource: "opening_entries" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.accounting");
      const raw = formToObject(formData) as Record<string, unknown>;
      const pick = (prefix: string) =>
        Object.entries(raw)
          .filter(([key]) => key.startsWith(`${prefix}:`))
          .map(([key, value]) => [key.slice(prefix.length + 1), Math.max(0, Number(value) || 0)] as const);
      const staffIds = new Set([...pick("staffPayable"), ...pick("staffAdvance")].map(([id]) => id));
      const payable = new Map(pick("staffPayable"));
      const advance = new Map(pick("staffAdvance"));

      const result = await apiPut(
        "/v1/panel/reports/accounting/opening",
        {
          asOf: input.asOf,
          cashMinor: input.cash,
          banks: pick("bank").map(([bankAccountId, amountMinor]) => ({ bankAccountId, amountMinor })),
          vendors: pick("vendor").map(([vendorId, amountMinor]) => ({ vendorId, amountMinor })),
          staff: [...staffIds].map((staffId) => ({
            staffId,
            payableMinor: payable.get(staffId) ?? 0,
            advanceMinor: advance.get(staffId) ?? 0,
          })),
          units: pick("unit").map(([unitId, amountMinor]) => ({ unitId, amountMinor })),
        },
        openingSaveResult,
      );
      return okState(
        result.unitsLocked > 0
          ? t("openingSavedLocked", { locked: result.unitsLocked })
          : t("openingSaved", { created: result.unitsCreated, updated: result.unitsUpdated }),
      );
    },
  );
}
