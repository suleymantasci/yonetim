"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  dateField,
  okState,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

const idResult = z.object({ id: z.string() });

const createSchema = z.object({
  code: requiredText(3, 30),
  discountType: z.enum(["percent", "amount"]),
  discountValue: z.preprocess((v) => (typeof v === "string" ? v.replace(",", ".") : v), z.coerce.number().positive()),
  validFrom: dateField,
  validUntil: dateField,
  usageLimit: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().positive().optional()),
  restrictedToTenantId: optionalUuidField,
  campaignId: optionalUuidField,
});

export async function createPromoCode(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "admin:billing", schema: createSchema, meta: { action: "promo_code_created", resource: "promo_code" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.platformCampaigns");
      // Bitiş günü dahil: kullanıcı "31 Aralık'a kadar" yazdığında o gün de geçerli.
      const until = new Date(input.validUntil.getTime() + 86_400_000 - 1);
      await apiPost(
        "/v1/panel/platform/promo-codes",
        {
          code: input.code.toUpperCase(),
          discountType: input.discountType,
          discountValue: input.discountValue,
          validFrom: input.validFrom,
          validUntil: until,
          usageLimit: input.usageLimit ?? null,
          restrictedToTenantId: input.restrictedToTenantId ?? null,
          campaignId: input.campaignId ?? null,
        },
        idResult,
      );
      return okState(t("codeCreated", { code: input.code.toUpperCase() }));
    },
  );
}

const toggleSchema = z.object({ id: uuidField, isActive: z.enum(["true", "false"]) });

export async function togglePromoCode(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "admin:billing", schema: toggleSchema, meta: { action: "promo_code_updated", resource: "promo_code" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.platformCampaigns");
      await apiPatch(`/v1/panel/platform/promo-codes/${input.id}`, { isActive: input.isActive === "true" }, idResult);
      return okState(input.isActive === "true" ? t("codeActivated") : t("codeDeactivated"));
    },
  );
}

const statusSchema = z.object({ id: uuidField, status: z.enum(["draft", "active", "paused", "expired"]) });

export async function setCampaignStatus(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "admin:billing", schema: statusSchema, meta: { action: "campaign_status_changed", resource: "campaign" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.platformCampaigns");
      await apiPatch(`/v1/panel/platform/campaigns/${input.id}/status`, { status: input.status }, idResult);
      return okState(t("campaignStatusChanged"));
    },
  );
}
