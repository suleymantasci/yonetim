import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, money, timestamps } from "./_shared";
import {
  campaignStatusEnum, campaignTypeEnum, invoiceStatusEnum, subscriptionStatusEnum,
} from "./enums";
import { tenants } from "./tenants";

/** Paketler — SPEC Bölüm 2.3 (15 kademe + kurumsal). */
export const plans = pgTable(
  "plans",
  {
    id: idCol(),
    code: varchar("code", { length: 30 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    tier: integer("tier").notNull(),
    minUnits: integer("min_units").notNull(),
    maxUnits: integer("max_units"),
    /** Yıllık liste fiyatı (kuruş, KDV dahil). */
    yearlyPriceKurus: money("yearly_price_kurus").notNull(),
    smsQuotaYearly: integer("sms_quota_yearly").notNull().default(0),
    /** Rakip (Yonetimcell) fiyatı — pazarlama karşılaştırması için. */
    competitorYearlyPriceKurus: money("competitor_yearly_price_kurus"),
    features: jsonb("features").notNull().default({}),
    isCustom: boolean("is_custom").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_plans_code").on(t.code)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: idCol(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    /** 'monthly' | 'quarterly' | 'semiannual' | 'yearly' — tahsilat periyodu. */
    billingPeriod: varchar("billing_period", { length: 20 }).notNull().default("yearly"),
    processor: varchar("processor", { length: 20 }).notNull().default("iyzico"),
    processorSubId: varchar("processor_sub_id", { length: 120 }),
    unitCountSnapshot: integer("unit_count_snapshot").notNull().default(0),
    /** Kampanya sonrası nihai fiyat (kuruş). */
    priceKurus: money("price_kurus").notNull(),
    listPriceKurus: money("list_price_kurus").notNull(),
    discountKurus: money("discount_kurus").notNull().default(0),
    appliedCampaignId: uuid("applied_campaign_id"),
    appliedPromoCode: varchar("applied_promo_code", { length: 30 }),
    /** Kampanya bitse de bu dönem sonuna kadar fiyat kilitli (Bölüm 16.7). */
    priceLockedUntil: timestamp("price_locked_until", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Dunning durumu (Bölüm 15.3). */
    dunningStep: integer("dunning_step").notNull().default(0),
    dunningStartedAt: timestamp("dunning_started_at", { withTimezone: true }),
    smsUsedThisPeriod: integer("sms_used_this_period").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("idx_subs_tenant").on(t.tenantId),
    index("idx_subs_status_period").on(t.status, t.currentPeriodEnd),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: idCol(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    invoiceNo: varchar("invoice_no", { length: 30 }).notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    subtotalKurus: money("subtotal_kurus").notNull(),
    discountKurus: money("discount_kurus").notNull().default(0),
    vatKurus: money("vat_kurus").notNull().default(0),
    totalKurus: money("total_kurus").notNull(),
    /** SMS kota aşımı kalemi (Bölüm 15.4). */
    smsOverageCount: integer("sms_overage_count").notNull().default(0),
    smsOverageKurus: money("sms_overage_kurus").notNull().default(0),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** GİB e-Fatura (Bölüm 15.2). */
    einvoiceUuid: varchar("einvoice_uuid", { length: 60 }),
    einvoiceSentAt: timestamp("einvoice_sent_at", { withTimezone: true }),
    pdfUrl: text("pdf_url"),
    lineItems: jsonb("line_items").notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_invoices_no").on(t.invoiceNo),
    index("idx_invoices_tenant").on(t.tenantId),
  ],
);

/** Kampanya tanımı — SPEC Bölüm 16.2 ile birebir. */
export const campaigns = pgTable(
  "campaigns",
  {
    id: idCol(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").notNull().default(""),
    type: campaignTypeEnum("type").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    audience: jsonb("audience").notNull().default({}),
    conditions: jsonb("conditions").notNull().default({}),
    reward: jsonb("reward").notNull().default({}),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    perTenantLimit: integer("per_tenant_limit").notNull().default(1),
    showOnPricingPage: boolean("show_on_pricing_page").notNull().default(true),
    badge: varchar("badge", { length: 20 }),
    stackable: boolean("stackable").notNull().default(false),
    heroImageUrl: text("hero_image_url"),
    slug: varchar("slug", { length: 80 }).notNull(),
    /** A/B testi grubu (Bölüm 16.4). */
    abGroup: varchar("ab_group", { length: 10 }),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_campaigns_code").on(t.code),
    uniqueIndex("idx_campaigns_slug").on(t.slug),
    index("idx_campaigns_status_dates").on(t.status, t.startsAt, t.endsAt),
  ],
);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: idCol(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 30 }).notNull(),
    discountType: varchar("discount_type", { length: 20 }).notNull(),
    discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").notNull().default(0),
    /** Tek tenant'a özel kod. */
    restrictedToTenantId: uuid("restricted_to_tenant_id"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_promo_codes_code").on(t.code)],
);

export const promoCodeRedemptions = pgTable(
  "promo_code_redemptions",
  {
    id: idCol(),
    promoCodeId: uuid("promo_code_id").notNull().references(() => promoCodes.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id"),
    tenantId: uuid("tenant_id").notNull(),
    subscriptionId: uuid("subscription_id"),
    discountKurus: money("discount_kurus").notNull().default(0),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_redemptions_tenant").on(t.tenantId),
    uniqueIndex("idx_redemptions_code_tenant").on(t.promoCodeId, t.tenantId),
  ],
);

/** Tavsiye et-kazan (Bölüm 16.1 #5). */
export const referrals = pgTable(
  "referrals",
  {
    id: idCol(),
    referrerTenantId: uuid("referrer_tenant_id").notNull(),
    referredTenantId: uuid("referred_tenant_id"),
    code: varchar("code", { length: 20 }).notNull(),
    inviteeEmail: varchar("invitee_email", { length: 255 }),
    inviteePhone: varchar("invitee_phone", { length: 20 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    rewardKurus: money("reward_kurus").notNull().default(0),
    rewardPaidAt: timestamp("reward_paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_referrals_code").on(t.code),
    index("idx_referrals_referrer").on(t.referrerTenantId),
  ],
);

/** 3rd-party entegrasyon bağlantıları (tenant başına). */
export const integrations = pgTable(
  "integrations",
  {
    id: idCol(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 40 }).notNull(),
    /** AES-256-GCM ile şifreli credential JSON. */
    credentialsEncrypted: text("credentials_encrypted"),
    status: varchar("status", { length: 20 }).notNull().default("disconnected"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    config: jsonb("config").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_integrations_tenant_provider").on(t.tenantId, t.provider)],
);

/** Feature flag'ler — Bölüm 18.1 #8 (yüzdelik rollout). */
export const featureFlags = pgTable(
  "feature_flags",
  {
    id: idCol(),
    key: varchar("key", { length: 60 }).notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(false),
    rolloutPct: integer("rollout_pct").notNull().default(0),
    /** Belirli tenant'lara açık. */
    tenantAllowlist: jsonb("tenant_allowlist").notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_flags_key").on(t.key)],
);

/** Migration (rakipten geçiş) işleri — Bölüm 3.11. */
export const migrationJobs = pgTable(
  "migration_jobs",
  {
    id: idCol(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 30 }).notNull(),
    fileName: varchar("file_name", { length: 200 }),
    fileUrl: text("file_url"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    errors: jsonb("errors").notNull().default([]),
    mapping: jsonb("mapping").notNull().default({}),
    summary: jsonb("summary").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("idx_migration_tenant").on(t.tenantId)],
);
