import { relations } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, softDelete, timestamps } from "./_shared";
import { tenantStatusEnum, tenantTypeEnum } from "./enums";

/** SPEC Bölüm 5.2 — Tenant modeli. */
export const tenants = pgTable(
  "tenants",
  {
    id: idCol(),
    slug: varchar("slug", { length: 50 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    type: tenantTypeEnum("type").notNull().default("apartment"),
    unitCount: integer("unit_count").notNull().default(0),
    managerId: uuid("manager_id"),
    /** Yönetim şirketi bu siteyi yönetiyorsa (Bölüm 2.2 — çoklu site konsolu). */
    companyId: uuid("company_id"),

    // Adres (landing page + SEO — Bölüm 6.14)
    city: varchar("city", { length: 60 }),
    district: varchar("district", { length: 60 }),
    neighborhood: varchar("neighborhood", { length: 120 }),
    addressLine: text("address_line"),
    postalCode: varchar("postal_code", { length: 10 }),
    latitude: varchar("latitude", { length: 20 }),
    longitude: varchar("longitude", { length: 20 }),

    settings: jsonb("settings").notNull().default({}),
    status: tenantStatusEnum("status").notNull().default("trial"),
    planId: uuid("plan_id"),

    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),

    /**
     * Site yaşam döngüsü — "yönetim bu siteyle işini bitirdi" hâli.
     *
     * `status = 'archived'` tek başına yetmiyordu: durum sütunu **ne** olduğunu
     * söylüyor, **ne zaman** ve **kimin** kararıyla olduğunu söylemiyor. Geri
     * kurtarma penceresini hesaplamak için ilkine, hesap verebilirlik için
     * ikincisine ihtiyaç var.
     *
     * `purgeAfterAt` süreyi **satırın kendisinde** tutuyor, config'den
     * hesaplanmıyor: pencere uzunluğu (bugün 90 gün) sonra değişirse, o sırada
     * arşivde bekleyen sitelerin kendilerine söz verilen tarihi değişmemeli.
     * Yöneticiye "90 gün içinde geri alabilirsin" denip 30 güne düşürülmesi,
     * kurtarma sözünün ihlali olurdu.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by"),
    purgeAfterAt: timestamp("purge_after_at", { withTimezone: true }),
    /** Arşivden önceki durum — geri açarken hangi hâle dönüleceği. */
    statusBeforeArchive: tenantStatusEnum("status_before_archive"),

    /** Hangi sistemden geçiş yapıldı (Bölüm 3.11). */
    migratedFrom: varchar("migrated_from", { length: 40 }),
    /** Public landing page yayında mı (Bölüm 6.14). */
    landingPublished: boolean("landing_published").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("idx_tenants_slug").on(t.slug),
    index("idx_tenants_status").on(t.status),
    index("idx_tenants_period_end").on(t.currentPeriodEnd),
    index("idx_tenants_company").on(t.companyId),
    index("idx_tenants_city_district").on(t.city, t.district),
    /** Tasfiye job'ı "süresi dolmuş arşiv" sorgusunu bu index'le tarıyor. */
    index("idx_tenants_purge_after").on(t.purgeAfterAt),
  ],
);

/** Yönetim şirketleri — bir şirket N tenant yönetir (Bölüm 2.2). */
export const companies = pgTable(
  "companies",
  {
    id: idCol(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 60 }).notNull(),
    taxNumber: varchar("tax_number", { length: 11 }),
    taxOffice: varchar("tax_office", { length: 100 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    address: text("address"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("idx_companies_slug").on(t.slug)],
);

/** Tenant başına ayar override'ları tip güvenli okunur (settings JSONB şeması). */
export interface TenantSettings {
  duesDueDayOfMonth?: number;
  lateFeeEnabled?: boolean;
  lateFeeMonthlyPct?: number;
  defaultDuesFormula?: string;
  currency?: string;
  landingHeroImageUrl?: string;
  whatsappOptInRequired?: boolean;
  branding?: { primaryColor?: string; logoUrl?: string };
  kvkkContactEmail?: string;
  invoiceInfo?: { title?: string; taxNumber?: string; taxOffice?: string; address?: string };
}

export const tenantsRelations = relations(tenants, ({ one }) => ({
  company: one(companies, { fields: [tenants.companyId], references: [companies.id] }),
}));
