import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, softDelete, tenantId, timestamps } from "./_shared";
import { ownershipTypeEnum, unitTypeEnum } from "./enums";
import { tenants } from "./tenants";
import { users } from "./users";

export const blocks = pgTable(
  "blocks",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    floorCount: integer("floor_count").notNull().default(1),
    unitCount: integer("unit_count").notNull().default(0),
    hasElevator: boolean("has_elevator").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_blocks_tenant").on(t.tenantId),
    uniqueIndex("idx_blocks_tenant_name").on(t.tenantId, t.name),
  ],
);

export const units = pgTable(
  "units",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    blockId: uuid("block_id").references(() => blocks.id, { onDelete: "set null" }),
    number: varchar("number", { length: 20 }).notNull(),
    floor: integer("floor").notNull().default(0),
    type: unitTypeEnum("type").notNull().default("flat"),
    areaM2: numeric("area_m2", { precision: 8, scale: 2 }),
    /**
     * Arsa payı — borçlandırma formülü girdisi.
     *
     * KARAR (GAP 4.2.3): ondalık oran **kanonik** kalır (formüller, toplama ve
     * `distribute()` bu sütunu okur), pay/payda ise **girdi ve gösterim** için
     * ayrıca saklanır. Tapuda arsa payı "120/1000" biçiminde yazılıdır; yöneticiden
     * "0.120000" yazmasını istemek hata kaynağıydı. İki temsil arasındaki tutarlılık
     * uygulama katmanında kurulur: pay/payda girildiğinde ondalık türetilir.
     */
    landShare: numeric("land_share", { precision: 10, scale: 6 }),
    /** Tapudaki pay (örn. 120). Girildiyse `landShare` bundan türetilir. */
    landShareNumerator: integer("land_share_numerator"),
    /** Tapudaki payda (örn. 1000). Blok/site genelinde aynı olması beklenir. */
    landShareDenominator: integer("land_share_denominator"),
    roomCount: varchar("room_count", { length: 10 }),
    residentCount: integer("resident_count").notNull().default(0),
    ownershipType: ownershipTypeEnum("ownership_type").notNull().default("owner"),
    currentOwnerId: uuid("current_owner_id").references(() => users.id, { onDelete: "set null" }),
    currentTenantId: uuid("current_tenant_id").references(() => users.id, { onDelete: "set null" }),
    /** Aidat muafiyeti (örn. boş daire kararı, yönetici muafiyeti). */
    duesExempt: boolean("dues_exempt").notNull().default(false),
    /**
     * Gecikme tazminatı muafiyeti — GAP 4.2.5.
     *
     * Rakip şikâyeti: "102 daireden 20'sine farklı gecikme uygulamak için manuel
     * hesap gerekiyor." Muafiyet üç düzeyde çalışır: birim (bu sütun), tek borç
     * (`debts.late_fee_exempt`) ve plan (`dues_plans.late_fee_monthly_pct = 0`).
     * Herhangi biri muaf diyorsa tazminat işlemez (fail-safe: tahsil etmemek,
     * haksız tahsil etmekten iyidir).
     */
    lateFeeExempt: boolean("late_fee_exempt").notNull().default(false),
    /**
     * "Bu dairenin aidat borçlandırmalarını maliğe kaydet" — borçlu kuralı
     * `occupant` olan aidat türlerinde kiracı yerine malik borçlanır
     * (kira sözleşmesinde aidat malikte kalmışsa).
     */
    ownerPaysDues: boolean("owner_pays_dues").notNull().default(false),
    duesMultiplier: numeric("dues_multiplier", { precision: 5, scale: 3 }).notNull().default("1"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_units_tenant").on(t.tenantId),
    uniqueIndex("idx_units_tenant_block_number").on(t.tenantId, t.blockId, t.number),
    index("idx_units_owner").on(t.currentOwnerId),
    index("idx_units_tenant_resident").on(t.currentTenantId),
  ],
);

/** Malik/kiracı ilişkisi zaman içinde değişir — SPEC Bölüm 5.3. */
export const unitOccupancies = pgTable(
  "unit_occupancies",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    relation: ownershipTypeEnum("relation").notNull(),
    /** Hisseli mülkiyette pay oranı (%). */
    ownershipPct: numeric("ownership_pct", { precision: 6, scale: 3 }).notNull().default("100"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    /**
     * Kiracı ayrılırsa kalan borcun devri (Bölüm 6.1 "Borç paylaşımı").
     * 'owner' → malike, 'next_tenant' → yeni kiracıya, 'keep' → kişide kalır.
     */
    debtTransferPolicy: varchar("debt_transfer_policy", { length: 20 })
      .notNull()
      .default("owner"),
    contractUrl: text("contract_url"),
    ...timestamps,
  },
  (t) => [
    index("idx_occupancy_tenant_unit").on(t.tenantId, t.unitId),
    index("idx_occupancy_user").on(t.userId),
    index("idx_occupancy_active").on(t.unitId, t.endDate),
  ],
);

/** Ortak alan / rezerve edilebilir kaynaklar (Bölüm 6.7). */
export const resources = pgTable(
  "resources",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    capacity: integer("capacity"),
    /** Saatlik/günlük ücret (kuruş). */
    feeKurus: integer("fee_kurus").notNull().default(0),
    feeUnit: varchar("fee_unit", { length: 10 }).notNull().default("hour"),
    depositKurus: integer("deposit_kurus").notNull().default(0),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    maxHoursPerBooking: integer("max_hours_per_booking").notNull().default(4),
    maxBookingsPerMonth: integer("max_bookings_per_month").notNull().default(4),
    openHour: integer("open_hour").notNull().default(8),
    closeHour: integer("close_hour").notNull().default(23),
    rulesText: text("rules_text"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_resources_tenant").on(t.tenantId)],
);
