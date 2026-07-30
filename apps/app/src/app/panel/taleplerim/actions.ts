"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import {
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Sakinin talep akışı — yönetimin `/panel/talepler/actions.ts` dosyasının
 * sakin karşılığı.
 *
 * NEDEN AYRI: yönetim formu daire, atama, maliyet ve durum alanlarını
 * taşıyor; sakin bunların hiçbirini ayarlayamaz. Aynı eylemi paylaşıp
 * alanları gizlemek, gizlenen alanların `FormData`'ya elle eklenebildiği bir
 * yüzey bırakırdı. Sakin ucu (`/v1/panel/portal/requests`) daireyi zaten
 * oturumdan çözüyor.
 */

const CATEGORIES = [
  "asansor",
  "su",
  "elektrik",
  "dogalgaz",
  "ortak_alan",
  "guvenlik",
  "temizlik",
  "hasere",
  "diger",
] as const;

/**
 * Sakin `critical` seçemiyor: aciliyet sınıfı SLA sayacını başlatıyor ve
 * herkesin kendi talebini kritik işaretlemesi sıralamayı anlamsızlaştırırdı.
 * Gerçekten acil durumda yönetim önceliği kendi ekranından yükseltiyor.
 */
const PRIORITIES = ["low", "normal", "high"] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  title: requiredText(3, 200),
  description: optionalText(4000),
  priority: z.enum(PRIORITIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
});

export async function createMyRequest(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "request:write",
      schema: createSchema,
      meta: { action: "portal_request_created", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myRequests");

      const result = await apiPost(
        "/v1/panel/portal/requests",
        {
          category: input.category,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority,
        },
        z.object({ id: z.string().uuid(), code: z.string() }),
      );

      return okState(t("created", { code: result.code }), {
        redirectTo: `/panel/taleplerim/${result.id}`,
        data: { id: result.id },
      });
    },
  );
}

const commentSchema = z.object({
  id: uuidField,
  body: requiredText(1, 4000),
});

export async function addMyRequestComment(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "request:write",
      schema: commentSchema,
      meta: { action: "portal_request_commented", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myRequests");

      const result = await apiPost(
        `/v1/panel/portal/requests/${input.id}/comments`,
        { body: input.body },
        z.object({ id: z.string().uuid() }),
      );

      return okState(t("commentAdded"), { data: { id: result.id } });
    },
  );
}
