"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import { okState, requiredText, runAction, V, type ActionState } from "@/lib/form";

const schema = z.object({
  until: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.invalidDate).nullable()),
  reason: requiredText(5, 300),
});

/** Dönem kilidi — tarih boşsa kilit kaldırılır. */
export async function savePeriodLock(_p: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "settings:write", schema, meta: { action: "period_lock", resource: "tenant" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.periodLock");
      await apiPost("/v1/panel/cash/lock", { until: input.until, reason: input.reason }, z.object({ until: z.string().nullable() }));
      return okState(input.until ? t("locked", { date: input.until.split("-").reverse().join(".") }) : t("unlocked"));
    },
  );
}
