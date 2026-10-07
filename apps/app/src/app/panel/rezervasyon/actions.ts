"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  reservationSaveResult,
  resourceSaveResult,
} from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  intField,
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
 * Rezervasyon yazma köprüsü — PROJE-DURUMU §5.2, sıra 5.
 *
 * İKİ AYRI KAYIT TÜRÜ: **tesis** (rezerve edilebilir kaynak) ve
 * **rezervasyon**. Tesis tanımı modülün girişiydi ve hiç yoktu; ekran boş bir
 * liste göstermekten başka bir şey yapamıyordu.
 *
 * Ücret, çakışma kontrolü, açılış saati sınırı ve onay gerekip gerekmediği
 * `apps/api`'de. Buradaki tek iş doğrulama ve HTTP.
 */

const RESOURCE_KINDS = [
  "salon",
  "misafir_odasi",
  "spor",
  "havuz",
  "otopark",
  "teras",
  "bahce",
  "diger",
] as const;

const FEE_UNITS = ["hour", "day", "booking"] as const;

const DECISIONS = [
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "no_show",
] as const;

const resourceSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  name: requiredText(2, 120),
  kind: z.enum(RESOURCE_KINDS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  capacity: intField({ min: 0, max: 10_000 }),
  feeKurus: kurusField({ min: 0 }),
  feeUnit: z.enum(FEE_UNITS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  depositKurus: kurusField({ min: 0 }),
  requiresApproval: checkboxField,
  maxHoursPerBooking: intField({ min: 1, max: 24 }),
  maxBookingsPerMonth: intField({ min: 1, max: 100 }),
  openHour: intField({ min: 0, max: 23 }),
  closeHour: intField({ min: 1, max: 24 }),
  rulesText: optionalText(4000),
  isActive: checkboxField,
});

export async function saveResource(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "reservation:write",
      schema: resourceSchema,
      meta: { action: "resource_saved", resource: "resource" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.reservations");

      const body = {
        name: input.name,
        kind: input.kind,
        capacity: input.capacity,
        feeMinor: input.feeKurus,
        feeUnit: input.feeUnit,
        depositMinor: input.depositKurus,
        requiresApproval: input.requiresApproval,
        maxHoursPerBooking: input.maxHoursPerBooking,
        maxBookingsPerMonth: input.maxBookingsPerMonth,
        openHour: input.openHour,
        closeHour: input.closeHour,
        rulesText: input.rulesText ?? null,
        isActive: input.isActive,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/operations/reservations/resources/${input.id}`,
            body,
            resourceSaveResult,
          )
        : await apiPost(
            "/v1/panel/operations/reservations/resources",
            body,
            resourceSaveResult,
          );

      return okState(t("resourceSaved", { name: result.name }), {
        data: { id: result.id },
      });
    },
  );
}

/**
 * `datetime-local` → Date.
 *
 * `dateField` yalnız gün alıyor; rezervasyonda saat de gerekiyor ve saat
 * **yerel** yorumlanmalı: "14:00'te salon" cümlesi site sakininin saatiyle
 * söylenmiş bir cümle. Tarayıcının gönderdiği yerel damga ISO'ya sunucuda
 * İstanbul ofsetiyle çevriliyor.
 */
const dateTimeField = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") return undefined;
    const parsed = new Date(`${text}:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  z.date({ required_error: V.required, invalid_type_error: V.invalidDate }),
);

const reservationSchema = z.object({
  resourceId: uuidField,
  userId: uuidField,
  unitId: optionalUuidField,
  startAt: dateTimeField,
  endAt: dateTimeField,
  guestCount: intField({ min: 1, max: 1000 }),
  note: optionalText(1000),
});

export async function createReservation(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "reservation:write",
      schema: reservationSchema,
      meta: { action: "reservation_created", resource: "reservation" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.reservations");

      const result = await apiPost(
        "/v1/panel/operations/reservations",
        {
          resourceId: input.resourceId,
          userId: input.userId,
          unitId: input.unitId ?? null,
          startAt: input.startAt,
          endAt: input.endAt,
          guestCount: input.guestCount,
          note: input.note ?? null,
        },
        reservationSaveResult,
      );

      return okState(
        result.status === "pending"
          ? t("createdPending")
          : t("createdApproved"),
        { data: { id: result.id } },
      );
    },
  );
}

const decideSchema = z.object({
  id: uuidField,
  decision: z.enum(DECISIONS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  reason: optionalText(1000),
});

export async function decideReservation(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      // `reservation:write` değil: sakin kendi adına talep açabilir ama
      // onaylayan yönetimdir (`packages/core/rbac`).
      permission: "reservation:approve",
      schema: decideSchema,
      meta: { action: "reservation_decided", resource: "reservation" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.reservations");

      await apiPatch(
        `/v1/panel/operations/reservations/${input.id}/decision`,
        { decision: input.decision, reason: input.reason ?? null },
        z.object({ id: z.string().uuid(), status: z.string() }),
      );

      return okState(t("decided"), { data: { id: input.id } });
    },
  );
}

export interface ResourceMutationResult {
  ok: boolean;
  message: string;
}

export async function deleteResource(
  id: string,
): Promise<ResourceMutationResult> {
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");

  await apiDelete(`/v1/panel/operations/reservations/resources/${id}`);

  return { ok: true, message: t("resourceDeleted") };
}

const cancelOwnSchema = z.object({
  id: uuidField,
  reason: requiredText(3, 500),
});

/** Sakinin kendi rezervasyonunu iptali (yönetim de kullanabilir). */
export async function cancelOwnReservation(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "reservation:write",
      schema: cancelOwnSchema,
      meta: { action: "reservation_cancelled", resource: "reservation" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.reservations");
      await apiPost(`/v1/panel/operations/reservations/${input.id}/cancel`, {
        reason: input.reason,
      });
      return okState(t("cancelledOwn"));
    },
  );
}
