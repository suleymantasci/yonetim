"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requestSaveResult } from "@yonetim/contracts";

import { apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  kurusField,
  okState,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Talep/arıza yazma köprüsü — PROJE-DURUMU §5.2, sıra 2.
 *
 * Bu ekran bugüne kadar salt-okunurdu: SLA sayaçları yazılıydı ama besleyecek
 * kayıt üretilemiyordu. `request:write` ve `request:assign` yetkileri
 * tanımlıydı, hiçbir uçta kullanılmıyordu.
 *
 * Kod üretimi, SLA vadesi ve durum geçişinin zaman damgaları burada **değil**
 * `apps/api`'de; bu dosya doğrulama + HTTP.
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

const PRIORITIES = ["critical", "high", "normal", "low"] as const;

const STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_resident",
  "resolved",
  "closed",
  "rejected",
] as const;

const requestSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  unitId: optionalUuidField,
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  title: requiredText(3, 200),
  description: optionalText(4000),
  priority: z.enum(PRIORITIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  assignedToUserId: optionalUuidField,
  costKurus: kurusField({ min: 0 }),
});

export async function saveRequest(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "request:write",
      schema: requestSchema,
      meta: { action: "request_saved", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.requests");

      const body = {
        unitId: input.unitId ?? null,
        category: input.category,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        assignedToUserId: input.assignedToUserId ?? null,
        costMinor: input.costKurus,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/operations/requests/${input.id}`,
            body,
            requestSaveResult,
          )
        : await apiPost("/v1/panel/operations/requests", body, requestSaveResult);

      return okState(t("saved", { code: result.code }), {
        data: { id: result.id },
      });
    },
  );
}

const statusSchema = z.object({
  id: uuidField,
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  resolutionNote: optionalText(2000),
});

/**
 * Durum geçişi.
 *
 * Ayrı eylem, çünkü ayrı uç: geçişin yan etkileri (ilk yanıt/çözüm/kapanış
 * zamanı) formun kaydettiği alanlar değil, geçişin kendisinin ürettiği
 * izler. Kayıt formuyla birleştirmek, o izleri form alanı yapardı.
 */
export async function setRequestStatus(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "request:write",
      schema: statusSchema,
      meta: { action: "request_status_changed", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.requests");

      await apiPatch(
        `/v1/panel/operations/requests/${input.id}/status`,
        {
          status: input.status,
          resolutionNote: input.resolutionNote ?? null,
        },
        z.object({ id: z.string().uuid() }),
      );

      return okState(t("statusChanged"), { data: { id: input.id } });
    },
  );
}

const assignSchema = z.object({
  id: uuidField,
  assignedToUserId: optionalUuidField,
});

export async function assignRequest(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      // `request:write` değil: kimin hangi işi yapacağına karar vermek ayrı
      // bir yetki (`packages/core/rbac`) — `staff` rolünde yok.
      permission: "request:assign",
      schema: assignSchema,
      meta: { action: "request_assigned", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.requests");

      await apiPatch(
        `/v1/panel/operations/requests/${input.id}/assignment`,
        { assignedToUserId: input.assignedToUserId ?? null },
        z.object({ id: z.string().uuid() }),
      );

      return okState(t("assigned"), { data: { id: input.id } });
    },
  );
}

const commentSchema = z.object({
  id: uuidField,
  body: requiredText(1, 4000),
  isInternal: checkboxField,
});

export async function commentOnRequest(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "request:write",
      schema: commentSchema,
      meta: { action: "request_commented", resource: "request" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.requests");

      await apiPost(
        `/v1/panel/operations/requests/${input.id}/comments`,
        { body: input.body, isInternal: input.isInternal },
        z.object({ id: z.string().uuid() }),
      );

      return okState(t("commented"), { data: { id: input.id } });
    },
  );
}

/** Yetki kapısı — ekranın atama sütununu gösterip göstermeyeceğine karar verir. */
export async function ensureRequestWrite(): Promise<void> {
  await requirePermission("request:write");
}
