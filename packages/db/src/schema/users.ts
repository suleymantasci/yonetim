import {
  boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, softDelete, tenantId, timestamps } from "./_shared";
import { roleEnum } from "./enums";
import { tenants } from "./tenants";

/**
 * Kullanıcılar — platform genelinde tekil (bir kişi birden çok sitede olabilir).
 * Hassas alanlar (TCKN) şifreli saklanır: Bölüm 5.6.
 */
export const users = pgTable(
  "users",
  {
    id: idCol(),
    email: varchar("email", { length: 255 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    phone: varchar("phone", { length: 20 }),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    /** AES-256-GCM şifreli TCKN (Bölüm 5.6). */
    tcknEncrypted: text("tckn_encrypted"),
    /** Eşitlik sorgusu için blind index. */
    tcknIndex: varchar("tckn_index", { length: 64 }),
    avatarUrl: text("avatar_url"),
    locale: varchar("locale", { length: 5 }).notNull().default("tr"),
    /** Platform seviyesi rol; tenant rolleri memberships tablosunda. */
    platformRole: roleEnum("platform_role"),
    twoFactorSecret: text("two_factor_secret"),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    whatsappOptInAt: timestamp("whatsapp_opt_in_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** KVKK: anonimleştirildiyse (Bölüm 14.1). */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("idx_users_email").on(t.email),
    uniqueIndex("idx_users_phone").on(t.phone),
    index("idx_users_tckn_index").on(t.tcknIndex),
  ],
);

/** Kullanıcı ↔ tenant ilişkisi ve rolü (multi-tenant üyelik). */
export const memberships = pgTable(
  "memberships",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    title: varchar("title", { length: 80 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    invitedBy: uuid("invited_by"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("idx_memberships_tenant_user_role").on(t.tenantId, t.userId, t.role),
    index("idx_memberships_tenant").on(t.tenantId),
    index("idx_memberships_user").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: idCol(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Aktif tenant (Bölüm 13.2 tenant switch). */
    activeTenantId: uuid("active_tenant_id"),
    token: varchar("token", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    device: varchar("device", { length: 120 }),
    impersonatedBy: uuid("impersonated_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_sessions_token").on(t.token),
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_expires").on(t.expiresAt),
  ],
);

/** OTP / magic link / davet token'ları. */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: idCol(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    tenantId: uuid("tenant_id"),
    metadata: jsonb("metadata").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: text("attempts").notNull().default("0"),
    ...timestamps,
  },
  (t) => [
    index("idx_verification_identifier").on(t.identifier, t.purpose),
    uniqueIndex("idx_verification_token_hash").on(t.tokenHash),
  ],
);

/** KVKK açık rıza kayıtları — Bölüm 14.1. */
export const consents = pgTable(
  "consents",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 'kvkk_aydinlatma' | 'acik_riza_zorunlu' | 'acik_riza_pazarlama' | 'whatsapp_iletisim' */
    kind: varchar("kind", { length: 60 }).notNull(),
    granted: boolean("granted").notNull(),
    documentVersion: varchar("document_version", { length: 20 }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("idx_consents_user_kind").on(t.userId, t.kind),
    index("idx_consents_tenant").on(t.tenantId),
  ],
);
