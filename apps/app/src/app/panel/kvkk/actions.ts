"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  dateField,
  intField,
  okState,
  optionalDateField,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

const idResult = z.object({ id: z.string() });

/* ---------------------------------------------------------- başvuru */

const createSchema = z
  .object({
    type: z.enum(["access", "rectification", "erasure", "objection", "portability"]),
    userId: optionalUuidField,
    requesterEmail: optionalText(255),
    detail: requiredText(5, 2000),
    receivedAt: optionalDateField,
  })
  .refine((v) => Boolean(v.userId) || Boolean(v.requesterEmail), {
    message: "subject_required",
    path: ["userId"],
  });

export async function createKvkkRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "kvkk:manage", schema: createSchema, meta: { action: "kvkk_request_created", resource: "kvkk_request" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.kvkkPanel");
      await apiPost(
        "/v1/panel/kvkk/requests",
        {
          type: input.type,
          userId: input.userId ?? null,
          requesterEmail: input.requesterEmail || null,
          detail: input.detail,
          receivedAt: input.receivedAt,
        },
        idResult,
      );
      return okState(t("requestCreated"));
    },
  );
}

const updateSchema = z.object({
  requestId: uuidField,
  status: z.enum(["in_progress", "fulfilled", "rejected"]),
  responseNote: requiredText(10, 2000),
});

export async function updateKvkkRequest(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "kvkk:manage", schema: updateSchema, meta: { action: "kvkk_request_updated", resource: "kvkk_request" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.kvkkPanel");
      await apiPatch(
        `/v1/panel/kvkk/requests/${input.requestId}`,
        { status: input.status, responseNote: input.responseNote },
        z.object({ id: z.string(), status: z.string() }),
      );
      return okState(t(`requestStatusChanged.${input.status}`));
    },
  );
}

const eraseSchema = z.object({
  requestId: uuidField,
  responseNote: requiredText(10, 2000),
});

export async function eraseKvkkSubject(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "kvkk:manage", schema: eraseSchema, meta: { action: "kvkk_erasure_applied", resource: "kvkk_request" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.kvkkPanel");
      await apiPost(
        `/v1/panel/kvkk/requests/${input.requestId}/erase`,
        { responseNote: input.responseNote },
        z.object({ requestId: z.string() }),
      );
      return okState(t("erasureApplied"));
    },
  );
}

/* ------------------------------------------------------------- ihlal */

const breachSchema = z.object({
  title: requiredText(5, 200),
  description: requiredText(10, 4000),
  detectedAt: dateField,
  affectedUserCount: intField({ min: 0, max: 1_000_000 }),
  dataCategories: optionalText(400),
});

export async function createDataBreach(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "kvkk:manage", schema: breachSchema, meta: { action: "data_breach_recorded", resource: "data_breach" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.kvkkPanel");
      await apiPost(
        "/v1/panel/kvkk/breaches",
        {
          title: input.title,
          description: input.description,
          detectedAt: input.detectedAt,
          affectedUserCount: input.affectedUserCount,
          dataCategories: (input.dataCategories ?? "")
            .split(",")
            .map((c: string) => c.trim())
            .filter(Boolean),
        },
        idResult,
      );
      return okState(t("breachCreated"));
    },
  );
}

const breachUpdateSchema = z.object({
  breachId: uuidField,
  boardNotifiedAt: optionalDateField,
  subjectsNotifiedAt: optionalDateField,
  mitigation: optionalText(4000),
  status: z.enum(["open", "contained", "closed"]),
});

export async function updateDataBreach(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "kvkk:manage", schema: breachUpdateSchema, meta: { action: "data_breach_updated", resource: "data_breach" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.kvkkPanel");
      await apiPatch(
        `/v1/panel/kvkk/breaches/${input.breachId}`,
        {
          ...(input.boardNotifiedAt ? { boardNotifiedAt: input.boardNotifiedAt } : {}),
          ...(input.subjectsNotifiedAt ? { subjectsNotifiedAt: input.subjectsNotifiedAt } : {}),
          ...(input.mitigation ? { mitigation: input.mitigation } : {}),
          status: input.status,
        },
        idResult,
      );
      return okState(t("breachUpdated"));
    },
  );
}
