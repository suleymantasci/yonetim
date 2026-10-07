import { sql } from "drizzle-orm";
import {
  index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, timestamps } from "./_shared";

/**
 * Demo hesabı talepleri — landing'deki "Demo hesap iste" formu.
 *
 * PLATFORM TABLOSU (tenant_id YOK): talep bir siteye ait değil, siteyi
 * doğuran kayıt. RLS dışı; yalnız baypas bağlamında (yonetim_admin) okunur
 * ve yazılır.
 *
 * Satır demo silindiğinde **kalır** (`status = 'purged'`): iletişim bilgisi
 * satış takibi için tutuluyor (form KVKK rızasıyla alınıyor, `consent_at`).
 * Demo sitesinin kendisi ve demo kullanıcıları tamamen silinir.
 *
 * Durumlar:
 *   pending      → onay e-postası gitti, link bekleniyor
 *   provisioning → link tıklandı, worker siteyi üretiyor
 *   ready        → demo kullanılabilir (expires_at'e kadar)
 *   failed       → üretim yarıda kaldı; yarım veri temizlendi, tekrar denenebilir
 *   purged       → süre doldu, demo silindi
 *   cancelled    → link süresi doldu ya da superadmin iptal etti
 */
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: idCol(),
    /** Kısa kod — giriş adresinde ve demo site slug'larında görünür (`demo-<code>`). */
    code: varchar("code", { length: 12 }).notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    /** Kişinin kendi e-postası — küçük harfe indirilmiş. Giriş adresi değil. */
    email: varchar("email", { length: 255 }).notNull(),
    /** 'manager' (1 site) | 'company' (firma + 3 site). */
    kind: varchar("kind", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    /** Onay token'ının SHA-256'sı; token'ın kendisi hiçbir yerde saklanmaz. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    /** Demo giriş adresi (`demo-<code>@<demo domain>`). */
    loginEmail: varchar("login_email", { length: 255 }),
    /**
     * Giriş parolası, demo hazır olunca onay ekranında **bir kez** gösterilmek
     * üzere AES-GCM ile şifreli tutulur; ilk gösterimde ya da en geç demo
     * silinirken NULL'lanır. Parolanın düz hâli hiçbir zaman yazılmaz.
     */
    passwordSealed: text("password_sealed"),
    userId: uuid("user_id"),
    companyId: uuid("company_id"),
    tenantIds: uuid("tenant_ids").array().notNull().default(sql`'{}'::uuid[]`),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    credentialsMailedAt: timestamp("credentials_mailed_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    /** Son hata (üretim/silme) — superadmin ekranında görünür. */
    error: text("error"),
    /** Kaç kez üretim denendi (failed → tekrar dene). */
    attempts: integer("attempts").notNull().default(0),
    /** Demo kişilerinin telefon yuvası (`demo_phone_slot_seq`). */
    phoneSlot: integer("phone_slot"),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_demo_requests_code").on(t.code),
    uniqueIndex("idx_demo_requests_token").on(t.tokenHash),
    index("idx_demo_requests_email").on(t.email, t.status),
    index("idx_demo_requests_ip").on(t.ip, t.createdAt),
    index("idx_demo_requests_status_expires").on(t.status, t.expiresAt),
    /*
     * Aynı e-posta için aynı anda tek canlı demo: veritabanı da garanti
     * ediyor, uygulama kontrolü yarışta (iki sekmeden aynı anda gönderim)
     * ikinci satırı kaçırabilirdi.
     */
    uniqueIndex("uq_demo_requests_email_live")
      .on(t.email)
      .where(sql`status IN ('pending','provisioning','ready')`),
  ],
);
