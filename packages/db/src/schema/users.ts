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
    /**
     * Acil durumda aranacak kişi — GAP 4.1.2.
     * Kişiye bağlıdır (siteye değil): aynı sakin iki sitede kayıtlıysa
     * acil durum bilgisi tekrar sorulmaz.
     */
    emergencyContactName: varchar("emergency_contact_name", { length: 120 }),
    emergencyContactPhone: varchar("emergency_contact_phone", { length: 20 }),
    /**
     * Kan grubu — **KVKK md.6 anlamında özel nitelikli (sağlık) veri.**
     *
     * Sıradan bir profil alanı değil. Üç sonucu var ve üçü de kodda karşılığını
     * buluyor:
     *  1. İşlenmesi **açık rıza** ister (md.6/3; site yönetimi md.6/3'teki
     *     sır saklama yükümlüsü meslek grubuna girmiyor). Yazma yolu rıza
     *     kaydı olmadan bu alanı doldurmuyor — `consents.kind =
     *     'acik_riza_saglik'`.
     *  2. Okunması `data_access_logs`'a `data_category = 'health'` ile
     *     yazılıyor; genel `resident` kategorisiyle karışmıyor ki KVKK
     *     ekranında "kim sağlık verisine baktı" ayrı sorulabilsin.
     *  3. Rıza geri çekilirse alan **NULL'lanıyor** — rızası olmayan sağlık
     *     verisini saklamaya devam etmek ihlalin kendisi olurdu.
     *
     * Kişiye bağlı (siteye değil), acil durum kişisiyle aynı gerekçe.
     */
    bloodType: varchar("blood_type", { length: 6 }),
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

/**
 * Kullanıcı adresleri — GAP 4.2.9.
 *
 * Neden ayrı tablo: bir sakinin fatura adresi (ikamet ettiği daire),
 * tebligat adresi (yurt dışında oturan malik) ve KEP adresi farklı olabilir.
 * `users` tablosuna üç adres kolonu koymak hem şişirir hem "hangi adres
 * güncel?" sorusunu cevaplayamazdı.
 *
 * Adres alanı serbest metin: Türkiye'de yapılandırılmış adres (il/ilçe/mahalle)
 * standardı PTT kodu üzerinden çalışıyor; onu `postalCode` + `pttCode` ile
 * taşıyıp gerisini serbest bırakmak, yurt dışı adreslerini de kapsıyor.
 */
export const userAddresses = pgTable(
  "user_addresses",
  {
    id: idCol(),
    /** Adres kişiye bağlıdır; tenant kapsamı üyelik üzerinden gelir. */
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id"),
    /** 'invoice' | 'correspondence' | 'kep' | 'other' */
    kind: varchar("kind", { length: 20 }).notNull().default("correspondence"),
    label: varchar("label", { length: 60 }),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    district: varchar("district", { length: 80 }),
    city: varchar("city", { length: 80 }),
    postalCode: varchar("postal_code", { length: 12 }),
    countryCode: varchar("country_code", { length: 2 }).notNull().default("TR"),
    /** PTT adres kodu (varsa) — tebligatta adresin tekliğini garanti eder. */
    pttCode: varchar("ptt_code", { length: 20 }),
    /** KEP adresi (e-tebligat) — yalnız kind='kep' satırlarında dolu. */
    kepAddress: varchar("kep_address", { length: 160 }),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_user_addresses_user").on(t.userId, t.kind),
    index("idx_user_addresses_tenant").on(t.tenantId),
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
    /**
     * Yönetimin bu sakinle ilgili notu — **siteye özel** olduğu için
     * `users` değil `memberships` üzerinde. Sakine gösterilmez.
     */
    notes: text("notes"),
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

/**
 * Sakin erişim talebi — `/kayit-talebi` (SPEC Bölüm 6.14).
 *
 * NEDEN AYRI BİR TABLO: sitede oturan ama sisteme henüz tanımlanmamış bir kişi
 * kendini `memberships`'e yazamaz — yazabilseydi herkes istediği sitenin
 * sakini olurdu. Talep bu yüzden **onay bekleyen bir kayıt**: yönetici daire
 * numarasını ve kimliği doğrulayıp üyeliği kendisi açıyor.
 *
 * `user_id` nullable: talebi gönderen kişinin platformda hesabı olmayabilir.
 * Onay anında ya mevcut kullanıcı bulunuyor ya da yenisi açılıyor.
 *
 * Kişisel veri burada **onaya kadar** duruyor; reddedilen talep de siliniyor
 * değil kapatılıyor, çünkü "kim, ne zaman başvurdu" sorusu yöneticinin
 * hesap verebilirliğinin parçası (KVKK saklama süresi ayarlardan yönetiliyor).
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    /** Talebi eşleştirdiğimiz mevcut kullanıcı — yoksa onayda oluşturulur. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 255 }),
    /** Serbest metin: blok/daire yazımı sitelere göre değişiyor. */
    blockLabel: varchar("block_label", { length: 60 }),
    unitLabel: varchar("unit_label", { length: 40 }).notNull(),
    /** 'owner' | 'tenant' — yönetici onayda değiştirebilir. */
    claimedRelation: varchar("claimed_relation", { length: 20 }).notNull().default("tenant"),
    note: text("note"),
    /** 'pending' | 'approved' | 'rejected' */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Onay/ret sırasında bağlanan bağımsız bölüm. */
    unitId: uuid("unit_id"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    ip: varchar("ip", { length: 45 }),
    ...timestamps,
  },
  (t) => [
    index("idx_access_requests_tenant_status").on(t.tenantId, t.status),
    index("idx_access_requests_phone").on(t.phone),
  ],
);
