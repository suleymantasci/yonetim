"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { platformDemoPurgeResult } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
import { ActionError, okState, runAction, uuidField, type ActionState } from "@/lib/form";

const purgeSchema = z.object({
  id: uuidField,
  confirmCode: z.string().trim().min(4).max(12),
});

/**
 * Demoyu süresi dolmadan kalıcı olarak siler. İzin `tenant:delete` — yalnız
 * süper yönetici; API de ayrıca `super_admin` rolünü arıyor.
 */
export async function purgeDemo(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "tenant:delete", schema: purgeSchema, meta: { action: "demo_purged", resource: "demo_request" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.platformDemo");
      try {
        await apiPost(
          `/v1/panel/platform/demo-requests/${input.id}/purge`,
          { confirmCode: input.confirmCode },
          platformDemoPurgeResult,
        );
      } catch (error) {
        if (error instanceof AppError && error.message === "confirm_code_mismatch") {
          throw new ActionError(t("codeMismatch"), { confirmCode: [t("codeMismatch")] });
        }
        if (error instanceof AppError && error.message === "demo_provisioning") {
          throw new ActionError(t("provisioningBusy"));
        }
        throw error;
      }
      return okState(t("purged"));
    },
  );
}
