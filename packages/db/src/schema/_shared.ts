import { sql } from "drizzle-orm";
import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";

/** Her tabloda ortak: id + zaman damgaları. */
export const idCol = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Soft delete — SPEC Bölüm 11.2 "Onay yerine geri alma" (30 gün çöp kutusu). */
export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

/** tenant_id — RLS'in dayandığı sütun (Bölüm 13.3: NOT NULL zorunlu). */
export const tenantId = () => uuid("tenant_id").notNull();

/** Para: tam sayı kuruş (Bölüm: float aritmetiği yasak). */
export const money = (name: string) => bigint(name, { mode: "number" });
