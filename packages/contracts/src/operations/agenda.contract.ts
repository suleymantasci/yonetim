import { z } from "zod";

import { dateTime, isoDate, uuid } from "../_shared/fields";

/**
 * Ajanda — takvimde görev ve not (`/v1/panel/agenda`).
 *
 * Saat İstanbul saatidir (`HH:MM`); sunucu `day + time` → `remind_at`
 * çevirisini yapar. `remind: true` + saat yoksa 09:00.
 */
export const agendaKind = z.enum(["task", "note"]);
export type AgendaKind = z.infer<typeof agendaKind>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const agendaWrite = z
  .object({
    kind: agendaKind,
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(5000).nullish(),
    unitId: uuid.nullish(),
    day: isoDate.nullish(),
    time: time.nullish(),
    remind: z.coerce.boolean().default(false),
    shared: z.coerce.boolean().default(false),
  })
  .refine((v) => !v.remind || !!v.day, { path: ["day"], message: "remind_needs_day" });
export type AgendaWrite = z.infer<typeof agendaWrite>;

export const agendaItem = z.object({
  id: uuid,
  kind: agendaKind,
  title: z.string(),
  body: z.string().nullable(),
  unitId: uuid.nullable(),
  unitLabel: z.string().nullable(),
  day: isoDate.nullable(),
  /** İstanbul saati, hatırlatma yoksa null. */
  time: z.string().nullable(),
  remindAt: dateTime.nullable(),
  remindedAt: dateTime.nullable(),
  doneAt: dateTime.nullable(),
  shared: z.boolean(),
  mine: z.boolean(),
  createdByName: z.string().nullable(),
  createdAt: dateTime,
});
export type AgendaItem = z.infer<typeof agendaItem>;

export const agendaRangeQuery = z.object({
  from: isoDate,
  to: isoDate,
  unitId: uuid.optional(),
});

export const agendaList = z.object({ rows: z.array(agendaItem) });
export type AgendaList = z.infer<typeof agendaList>;

export const agendaDone = z.object({ done: z.coerce.boolean() });
