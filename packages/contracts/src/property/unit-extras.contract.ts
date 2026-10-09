import { z } from "zod";

import { uuid } from "../_shared/fields";

/** Daire kartı: hane halkı ve araçlar — `/v1/panel/units/:id/extras`. */
export const HOUSEHOLD_RELATIONS = ["spouse", "child", "parent", "relative", "other"] as const;

export const householdMember = z.object({
  id: uuid,
  fullName: z.string(),
  relation: z.enum(HOUSEHOLD_RELATIONS),
  birthYear: z.number().int().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
});

export const unitVehicle = z.object({
  id: uuid,
  plate: z.string(),
  description: z.string().nullable(),
  ownerName: z.string().nullable(),
});

export const unitExtras = z.object({
  household: z.array(householdMember),
  vehicles: z.array(unitVehicle),
});
export type UnitExtras = z.infer<typeof unitExtras>;

export const householdCreate = z.object({
  fullName: z.string().trim().min(2).max(120),
  relation: z.enum(HOUSEHOLD_RELATIONS).default("other"),
  birthYear: z.coerce.number().int().min(1900).max(2100).nullish(),
  phone: z.string().trim().max(20).nullish(),
  note: z.string().trim().max(200).nullish(),
});
export type HouseholdCreate = z.infer<typeof householdCreate>;

/** Plaka: harf/rakam, ayraçlar atılır ve büyük harfe çevrilir (34 ABC 123 → 34ABC123). */
export function normalizePlate(input: string): string {
  return input.toLocaleUpperCase("tr").replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "");
}

export const vehicleCreate = z.object({
  plate: z
    .string()
    .trim()
    .transform(normalizePlate)
    .pipe(z.string().min(4).max(12)),
  description: z.string().trim().max(120).nullish(),
  ownerName: z.string().trim().max(120).nullish(),
});
export type VehicleCreate = z.infer<typeof vehicleCreate>;

export const vehicleSearch = z.object({
  rows: z.array(unitVehicle.extend({ unitId: uuid, unitLabel: z.string() })),
});
export type VehicleSearch = z.infer<typeof vehicleSearch>;
