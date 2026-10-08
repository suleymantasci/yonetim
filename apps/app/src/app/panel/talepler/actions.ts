"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { hasPermission } from "@yonetim/auth/guard";
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

      // Tam sayfa "yeni talep" kayıttan sonra boş formda kalıyordu; detaya
      // gidilsin. Çekmece `stayOnSuccess` ile bunu izlemiyor.
      return okState(t("saved", { code: result.code }), {
        data: { id: result.id },
        ...(input.id ? {} : { redirectTo: `/panel/talepler/${result.id}` }),
      });
    },
  );
}

const detailSchema = z.object({
  id: uuidField,
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  previousStatus: z.enum(STATUSES),
  /** Alan formda yoksa (yetki yok) atamaya dokunulmaz. */
  assignedToUserId: optionalUuidField,
  previousAssignee: optionalUuidField,
  body: optionalText(4000),
  isInternal: checkboxField,
});

const detailWithRecordSchema = detailSchema.merge(
  requestSchema.omit({ id: true, assignedToUserId: true }),
);

/**
 * Talep detayının **tek** kaydı: kayıt alanları, durum, atama ve yeni yorum.
 *
 * Ekranda dört ayrı form/dört ayrı "Kaydet" vardı; panelin geri kalanı tek
 * form + tek yapışkan kaydet çubuğu. API uçları ayrı kalıyor (yan etkileri ve
 * yetkileri farklı), birleştirme burada: yalnız **değişen** parça kendi ucuna
 * gidiyor. Sıra önemli — atama durumu "Atandı"ya çekebilir, kullanıcının
 * seçtiği durum ondan sonra yazılır ki son söz onun olsun.
 */
export async function saveRequestDetail(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  const withRecord = formData.has("title");
  return runAction(
    {
      permission: "request:write",
      schema: withRecord ? detailWithRecordSchema : detailSchema,
      meta: { action: "request_detail_saved", resource: "request" },
    },
    formData,
    async ({ ctx, input: raw }) => {
      const t = await getTranslations("app.requests");
      const input = raw as z.output<typeof detailWithRecordSchema>;
      const idOnly = z.object({ id: z.string().uuid() });
      let changed = false;

      if (withRecord) {
        await apiPatch(
          `/v1/panel/operations/requests/${input.id}`,
          {
            unitId: input.unitId ?? null,
            category: input.category,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
            costMinor: input.costKurus,
          },
          requestSaveResult,
        );
        changed = true;
      }

      const assignee = input.assignedToUserId ?? null;
      if (
        formData.has("assignedToUserId") &&
        hasPermission(ctx.roles, "request:assign") &&
        assignee !== (input.previousAssignee ?? null)
      ) {
        await apiPatch(
          `/v1/panel/operations/requests/${input.id}/assignment`,
          { assignedToUserId: assignee },
          idOnly,
        );
        changed = true;
      }

      if (input.status !== input.previousStatus) {
        await apiPatch(
          `/v1/panel/operations/requests/${input.id}/status`,
          { status: input.status, resolutionNote: null },
          idOnly,
        );
        changed = true;
      }

      if (input.body) {
        await apiPost(
          `/v1/panel/operations/requests/${input.id}/comments`,
          { body: input.body, isInternal: input.isInternal },
          idOnly,
        );
        changed = true;
      }

      return okState(changed ? t("detailSaved") : t("nothingChanged"), {
        data: { id: input.id },
      });
    },
  );
}

/** Yetki kapısı — ekranın atama sütununu gösterip göstermeyeceğine karar verir. */
export async function ensureRequestWrite(): Promise<void> {
  await requirePermission("request:write");
}
