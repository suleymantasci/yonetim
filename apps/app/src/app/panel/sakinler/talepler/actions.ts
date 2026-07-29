"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import {
  okState,
  optionalText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Erişim talebi kararları — PROJE-DURUMU §5.8.7.
 *
 * KARARIN KENDİSİ `apps/api`'de: üyelik açma, daire ilişkisi kurma ve
 * "aynı numara başka sitede kayıtlıysa yeni kullanıcı açma" kuralı
 * `AccessRequestService`'te. Burada yalnız formun doğrulaması ve HTTP var.
 *
 * DAİRE ONAYDA **ZORUNLU** ve formdan geliyor: başvurudaki `unitLabel`
 * serbest metin ve beyan. Sunucu da bunu arıyor (`unit_required`); iki
 * tarafta birden aramak, "3. daire" yazan birinin o dairenin sakini
 * olmasının önündeki tek engel.
 */
const approveSchema = z.object({
  id: uuidField,
  unitId: uuidField,
  relation: z.enum(["owner", "tenant"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
});

const rejectSchema = z.object({
  id: uuidField,
  rejectionReason: optionalText(500),
});

export async function approveAccessRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "resident:invite",
      schema: approveSchema,
      meta: { action: "access_request_approved", resource: "access_request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.accessRequests");

      await apiPost(
        `/v1/panel/residents/access-requests/${input.id}/approve`,
        { unitId: input.unitId, relation: input.relation },
        z.object({ ok: z.literal(true) }),
      );

      revalidatePath("/panel/sakinler/talepler");
      // Onay yeni bir sakin ve daire ilişkisi doğuruyor; sakin listesi ile
      // birim detayı bunu göstermeden yönetici işin bittiğinden emin olamaz.
      revalidatePath("/panel/sakinler");
      revalidatePath("/panel/birimler");

      return okState(t("approved"));
    },
  );
}

export async function rejectAccessRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "resident:invite",
      schema: rejectSchema,
      meta: { action: "access_request_rejected", resource: "access_request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.accessRequests");

      await apiPost(
        `/v1/panel/residents/access-requests/${input.id}/reject`,
        { rejectionReason: input.rejectionReason ?? undefined },
        z.object({ ok: z.literal(true) }),
      );

      revalidatePath("/panel/sakinler/talepler");

      return okState(t("rejected"));
    },
  );
}
