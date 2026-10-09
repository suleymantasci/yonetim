import { z } from "zod";

/** Y9 — veri araçları: tutarlılık kontrolü ve cari (kişi) birleştirme. */
export const DATA_CHECKS = [
  "open_debt_no_debtor",
  "overpaid_debt",
  "debt_status_mismatch",
  "unit_no_owner",
  "owner_share_not_100",
  "member_no_unit",
  "duplicate_people",
  "meter_no_unit",
  "unit_no_area",
] as const;

export const dataChecksResponse = z.object({
  checks: z.array(
    z.object({
      key: z.enum(DATA_CHECKS),
      severity: z.enum(["error", "warning", "info"]),
      count: z.number().int(),
      samples: z.array(z.object({ id: z.string(), label: z.string(), detail: z.string().nullable(), href: z.string().nullable() })),
    }),
  ),
});
export type DataChecksResponse = z.infer<typeof dataChecksResponse>;

export const mergePeopleQuery = z.object({ source: z.string().uuid(), target: z.string().uuid() });
export const mergePeopleSave = mergePeopleQuery.extend({ reason: z.string().trim().min(10).max(300) });
export type MergePeopleSave = z.infer<typeof mergePeopleSave>;

const person = z.object({ id: z.string(), name: z.string(), phone: z.string().nullable(), email: z.string().nullable(), roles: z.array(z.string()), units: z.array(z.string()) });
export const mergePeoplePreview = z.object({
  source: person,
  target: person,
  /** Taşınacak kayıt sayıları (tablo → adet). */
  moves: z.record(z.number().int()),
});
export type MergePeoplePreview = z.infer<typeof mergePeoplePreview>;

export const mergePeopleCandidates = z.object({
  people: z.array(person),
});
