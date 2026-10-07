"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import {
  okState,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/** Kargo ve ziyaretçi defteri yazma köprüsü. */
const parcelSchema = z.object({
  unitId: optionalUuidField,
  recipientName: requiredText(2, 160),
  carrier: optionalText(60),
  trackingNo: optionalText(80),
  note: optionalText(1000),
});

export async function receiveParcel(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "frontdesk:write", schema: parcelSchema, meta: { action: "parcel_received", resource: "parcel" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.frontdesk");
      const result = (await apiPost("/v1/panel/frontdesk/parcels", {
        unitId: input.unitId ?? null,
        recipientName: input.recipientName,
        carrier: input.carrier ?? null,
        trackingNo: input.trackingNo ?? null,
        note: input.note ?? null,
      })) as { notified: number };
      return okState(
        result.notified > 0 ? t("parcelReceivedNotified", { count: result.notified }) : t("parcelReceived"),
      );
    },
  );
}

const deliverSchema = z.object({ id: uuidField, deliveredTo: requiredText(2, 160) });

export async function deliverParcel(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "frontdesk:write", schema: deliverSchema, meta: { action: "parcel_delivered", resource: "parcel" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.frontdesk");
      await apiPost(`/v1/panel/frontdesk/parcels/${input.id}/deliver`, { deliveredTo: input.deliveredTo });
      return okState(t("parcelDelivered"));
    },
  );
}

const visitorSchema = z.object({
  unitId: optionalUuidField,
  visitorName: requiredText(2, 160),
  phone: optionalText(20),
  plate: optionalText(20),
  purpose: optionalText(120),
  note: optionalText(1000),
});

export async function registerVisitor(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "frontdesk:write", schema: visitorSchema, meta: { action: "visitor_registered", resource: "visitor" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.frontdesk");
      await apiPost("/v1/panel/frontdesk/visitors", {
        unitId: input.unitId ?? null,
        visitorName: input.visitorName,
        phone: input.phone ?? null,
        plate: input.plate ?? null,
        purpose: input.purpose ?? null,
        note: input.note ?? null,
      });
      return okState(t("visitorRegistered"));
    },
  );
}

const idSchema = z.object({ id: uuidField });

export async function checkoutVisitor(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "frontdesk:write", schema: idSchema, meta: { action: "visitor_checked_out", resource: "visitor" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.frontdesk");
      await apiPost(`/v1/panel/frontdesk/visitors/${input.id}/checkout`, {});
      return okState(t("visitorCheckedOut"));
    },
  );
}
