"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  okState,
  optionalText,
  optionalUuidField,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/** Ajanda yazma köprüsü (`/v1/panel/agenda`). */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const schema = z
  .object({
    id: optionalUuidField,
    kind: z.enum(["task", "note"]),
    title: requiredText(1, 200),
    body: optionalText(5000),
    unitId: optionalUuidField,
    day: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.invalidDate).optional()),
    time: z.preprocess(blankToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()),
    remind: checkboxField,
    shared: checkboxField,
  })
  .refine((v) => !v.remind || !!v.day, { path: ["day"], message: V.required });

export async function saveAgendaItem(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "agenda:write", schema, meta: { action: "agenda_saved", resource: "agenda" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.agenda");
      const body = {
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        unitId: input.unitId ?? null,
        day: input.day ?? null,
        time: input.time ?? null,
        remind: input.remind,
        shared: input.shared,
      };
      if (input.id) await apiPatch(`/v1/panel/agenda/${input.id}`, body);
      else await apiPost("/v1/panel/agenda", body);
      return okState(input.id ? t("updated") : t("created"));
    },
  );
}

/**
 * Üst bardaki hızlı not: ilk satır başlık, kalanı gövde. Tarih verilirse
 * o gün 09:00'da hatırlatılır.
 */
const quickSchema = z.object({
  text: requiredText(1, 5000),
  day: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, V.invalidDate).optional()),
});

export async function quickNote(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "agenda:write", schema: quickSchema, meta: { action: "agenda_saved", resource: "agenda" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.agenda");
      const [first, ...rest] = input.text.split("\n");
      await apiPost("/v1/panel/agenda", {
        kind: "note",
        title: first!.trim().slice(0, 200) || t("untitled"),
        body: rest.join("\n").trim() || null,
        day: input.day ?? null,
        remind: Boolean(input.day),
        shared: false,
      });
      return okState(t("created"));
    },
  );
}

const doneSchema = z.object({ id: uuidField, done: checkboxField });

export async function setAgendaDone(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "agenda:write", schema: doneSchema, meta: { action: "agenda_done", resource: "agenda" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.agenda");
      await apiPost(`/v1/panel/agenda/${input.id}/done`, { done: input.done });
      return okState(input.done ? t("markedDone") : t("markedOpen"));
    },
  );
}

const idSchema = z.object({ id: uuidField });

export async function deleteAgendaItem(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(
    { permission: "agenda:write", schema: idSchema, meta: { action: "agenda_deleted", resource: "agenda" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.agenda");
      await apiDelete(`/v1/panel/agenda/${input.id}`);
      return okState(t("deleted"));
    },
  );
}
