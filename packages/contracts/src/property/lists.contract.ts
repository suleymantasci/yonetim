import { z } from "zod";

import { moneyMinor, uuid } from "../_shared/fields";
import { memberScope } from "../_shared/member-scope";

/**
 * Üye listeleri — `/v1/panel/lists/*`: ikamet edenler, araç plakaları, TC
 * kimlik, boş/dolu bölümler, seçmeli sütunlu döküm. Hepsi aynı blok ve üye
 * kapsamı süzgeçlerini kullanır.
 */
export const listBaseQuery = z.object({
  blockId: uuid.optional(),
  member: memberScope.optional(),
  search: z.string().trim().max(80).optional(),
});

export const householdListQuery = listBaseQuery.extend({
  relation: z.string().max(20).optional(),
  /** "1": daire sakinlerinin kendileri de listede. */
  self: z.enum(["0", "1"]).default("1"),
});

export const householdListRow = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  status: z.string(),
  relation: z.string(),
  fullName: z.string(),
  phoneMasked: z.string().nullable(),
});

export const vehicleListQuery = listBaseQuery.extend({
  has: z.enum(["yes", "no", "all"]).default("yes"),
});

export const vehicleListRow = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  people: z.string().nullable(),
  plate: z.string().nullable(),
  description: z.string().nullable(),
  ownerName: z.string().nullable(),
});

export const tcknListQuery = listBaseQuery.extend({
  /** "1": açık TC (yönetici, denetim kaydıyla); yoksa maskeli. */
  reveal: z.enum(["0", "1"]).default("0"),
});

export const tcknListRow = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  relation: z.string(),
  former: z.boolean(),
  fullName: z.string(),
  tckn: z.string().nullable(),
});

export const occupancyListQuery = z.object({
  blockId: uuid.optional(),
  state: z.enum(["all", "empty", "occupied"]).default("all"),
});

export const occupancyListRow = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  occupied: z.boolean(),
  ownerName: z.string().nullable(),
  tenantName: z.string().nullable(),
  balanceMinor: moneyMinor,
});

export const DETAILED_COLUMNS = [
  "block",
  "number",
  "floor",
  "area",
  "landShare",
  "residentCount",
  "name",
  "relation",
  "share",
  "startDate",
  "endDate",
  "phone",
  "email",
  "balance",
] as const;

export const detailedListQuery = listBaseQuery.extend({
  columns: z
    .string()
    .transform((s) => s.split(",").filter((c): c is (typeof DETAILED_COLUMNS)[number] => (DETAILED_COLUMNS as readonly string[]).includes(c)))
    .pipe(z.array(z.enum(DETAILED_COLUMNS)).min(1)),
  /** "1": telefon açık (yönetici, denetim kaydıyla). */
  reveal: z.enum(["0", "1"]).default("0"),
});

export const detailedListResponse = z.object({
  columns: z.array(z.enum(DETAILED_COLUMNS)),
  rows: z.array(z.array(z.string())),
});
export type DetailedListResponse = z.infer<typeof detailedListResponse>;

export const listResponse = <T extends z.ZodTypeAny>(row: T) => z.object({ rows: z.array(row) });
