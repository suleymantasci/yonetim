import { type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, money, tenantId, timestamps } from "./_shared";
import {
  kvkkRequestStatusEnum, kvkkRequestTypeEnum, legalStageEnum, quorumRuleEnum,
} from "./enums";
import { tenants } from "./tenants";
import { units } from "./property";
import { users } from "./users";

/**
 * KARAR DEFTERİ — KMK md.32.
 *
 * NEDEN `meeting_decisions` BUNUN YERİNE GEÇMİYOR (üç sebep, üçü de yapısal):
 *
 * 1. **Numara site geneli ve süreklidir.** `meeting_decisions.decision_no`
 *    toplantı içinde tekil; her toplantı 1'den başlıyor. Karar defteri ise
 *    tek ve sürekli numaralı bir defter — "2019/7 sayılı karar" ifadesi
 *    ancak böyle anlam taşır ve mahkemede bu numarayla anılır.
 *
 * 2. **Toplantısız kararlar da deftere girer.** KMK md.32/son: kat malikleri
 *    kurulunun toplanmaksızın **oybirliğiyle** aldığı karar da geçerlidir ve
 *    deftere yazılır. Bir `meeting` satırı olmadığı için `meeting_decisions`
 *    bu kararı hiç taşıyamıyor. Aynı şey yöneticinin kendi yetkisiyle aldığı
 *    kararlar için de geçerli.
 *
 * 3. **Defter ekleme-yalnız (append-only).** Noter tasdikli, sayfaları
 *    numaralı bir defterin karşılığı bu: yazılan karar **düzeltilmez**,
 *    düzelten yeni bir karar yazılır (`corrects_entry_id`). Bu yüzden
 *    `softDelete` yok ve güncelleme yolu dar.
 *
 * `meeting_decisions` silinmiyor: toplantı ekranının oy sayımı ve yeter sayı
 * hesabı orada kalıyor. Deftere geçen karar `meeting_id` ile ona bağlanıyor.
 */
export const decisionBookEntries = pgTable(
  "decision_book_entries",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    /**
     * Defter sıra numarası — site genelinde **sürekli** ve tekil.
     * Boşluk bırakmaz: atlanan numara, yırtılmış sayfa gibi okunur.
     */
    entryNo: integer("entry_no").notNull(),
    /** Kararın alındığı tarih; kayda geçirildiği tarih değil. */
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    /**
     * 'kurul'   → kat malikleri kurulu toplantısı
     * 'yazili'  → toplantısız oybirliği (md.32/son)
     * 'yonetim' → yönetici / yönetim kurulu kararı
     */
    kind: varchar("kind", { length: 20 }).notNull().default("kurul"),
    /** Varsa çıktığı toplantı — toplantısız kararda NULL. */
    meetingId: uuid("meeting_id"),
    subject: varchar("subject", { length: 200 }).notNull(),
    body: text("body").notNull(),
    quorumRule: quorumRuleEnum("quorum_rule").notNull().default("simple_majority"),
    votesFor: numeric("votes_for", { precision: 12, scale: 6 }).notNull().default("0"),
    votesAgainst: numeric("votes_against", { precision: 12, scale: 6 }).notNull().default("0"),
    abstentions: numeric("abstentions", { precision: 12, scale: 6 }).notNull().default("0"),
    passed: boolean("passed").notNull().default(true),
    /**
     * Bu kayıt hangi kararı düzeltiyor.
     *
     * Defterde silgi yok: yanlış yazılan karar düzeltilmez, düzelten yeni bir
     * karar yazılır ve eskisine işaret eder. Ekran ikisini birlikte gösteriyor.
     */
    correctsEntryId: uuid("corrects_entry_id").references(
      (): AnyPgColumn => decisionBookEntries.id,
      { onDelete: "set null" },
    ),
    /** Noter tasdikli fiziki defterdeki sayfa — dijital ile kâğıt eşleşsin. */
    bookPageNo: integer("book_page_no"),
    attachmentUrls: jsonb("attachment_urls").notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    // `softDelete` **yok**: defterden karar silinmez (bkz. yukarıdaki 3. madde).
  },
  (t) => [
    uniqueIndex("idx_decision_book_tenant_no").on(t.tenantId, t.entryNo),
    index("idx_decision_book_tenant_date").on(t.tenantId, t.decidedAt),
    index("idx_decision_book_meeting").on(t.meetingId),
  ],
);

/**
 * Denetim kütüğü — Bölüm 5.3 + 14.2.
 * Append-only (UPDATE/DELETE trigger ile engellenir), aylık partition hedefli.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id"),
    action: varchar("action", { length: 60 }).notNull(),
    resource: varchar("resource", { length: 60 }).notNull(),
    resourceId: uuid("resource_id"),
    diff: jsonb("diff"),
    reason: text("reason"),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    /** Süper admin impersonate ediyorsa (Bölüm 18.2). */
    impersonatedBy: uuid("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_tenant_created").on(t.tenantId, t.createdAt),
    index("idx_audit_resource").on(t.resource, t.resourceId),
    index("idx_audit_user").on(t.userId),
  ],
);

/** KVKK veri erişim kütüğü — Bölüm 3.3 "kim ne zaman hangi veriyi gördü". */
export const dataAccessLogs = pgTable(
  "data_access_logs",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    /** Verisine erişilen kişi. */
    subjectUserId: uuid("subject_user_id").notNull(),
    /** Erişen kişi. */
    accessorUserId: uuid("accessor_user_id"),
    dataCategory: varchar("data_category", { length: 60 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    purpose: varchar("purpose", { length: 120 }),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_dal_subject").on(t.subjectUserId, t.createdAt),
    index("idx_dal_tenant").on(t.tenantId, t.createdAt),
  ],
);

export const kvkkRequests = pgTable(
  "kvkk_requests",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    requesterEmail: varchar("requester_email", { length: 255 }),
    type: kvkkRequestTypeEnum("type").notNull(),
    status: kvkkRequestStatusEnum("status").notNull().default("received"),
    detail: text("detail"),
    /** md.11 → 72 saat (siteConfig.legal.kvkkResponseHours). */
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    responseNote: text("response_note"),
    exportUrl: text("export_url"),
    handledBy: uuid("handled_by"),
    ...timestamps,
  },
  (t) => [
    index("idx_kvkk_tenant_status").on(t.tenantId, t.status),
    index("idx_kvkk_due").on(t.status, t.dueAt),
  ],
);

/** Veri ihlali bildirimleri — KVKK md.12/5 (72 saat). */
export const dataBreaches = pgTable(
  "data_breaches",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    affectedUserCount: integer("affected_user_count").notNull().default(0),
    dataCategories: jsonb("data_categories").notNull().default([]),
    boardNotifiedAt: timestamp("board_notified_at", { withTimezone: true }),
    subjectsNotifiedAt: timestamp("subjects_notified_at", { withTimezone: true }),
    mitigation: text("mitigation"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    ...timestamps,
  },
  (t) => [index("idx_breach_tenant").on(t.tenantId)],
);

/** Hukuk & icra — Bölüm 3.5 + 6.12. */
export const lawyers = pgTable(
  "lawyers",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    barNo: varchar("bar_no", { length: 40 }),
    barCity: varchar("bar_city", { length: 60 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("10"),
    contractUrl: text("contract_url"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("idx_lawyers_tenant").on(t.tenantId)],
);

export const legalCases = pgTable(
  "legal_cases",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    debtorUserId: uuid("debtor_user_id").references(() => users.id, { onDelete: "set null" }),
    lawyerId: uuid("lawyer_id").references(() => lawyers.id, { onDelete: "set null" }),
    caseNo: varchar("case_no", { length: 60 }),
    stage: legalStageEnum("stage").notNull().default("warning_letter"),
    principalKurus: money("principal_kurus").notNull().default(0),
    interestKurus: money("interest_kurus").notNull().default(0),
    costsKurus: money("costs_kurus").notNull().default(0),
    collectedKurus: money("collected_kurus").notNull().default(0),
    /** Tahsilat şansı skoru (kural motoru, 0-100) — Bölüm 3.5. */
    collectionScore: integer("collection_score"),
    scoreFactors: jsonb("score_factors").notNull().default({}),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    nextActionNote: text("next_action_note"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("idx_legal_tenant_stage").on(t.tenantId, t.stage),
    index("idx_legal_unit").on(t.unitId),
  ],
);

export const legalCaseEvents = pgTable(
  "legal_case_events",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull().references(() => legalCases.id, { onDelete: "cascade" }),
    stage: legalStageEnum("stage").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    note: text("note"),
    documentUrl: text("document_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_legal_events_case").on(t.caseId)],
);

/** "Borcu yoktur / borcu vardır" belge talepleri — Bölüm 3.6. */
export const debtCertificates = pgTable(
  "debt_certificates",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** 'clear' (borcu yoktur) | 'outstanding' (borcu vardır) */
    result: varchar("result", { length: 20 }).notNull(),
    outstandingKurus: money("outstanding_kurus").notNull().default(0),
    asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
    serialNo: varchar("serial_no", { length: 30 }).notNull(),
    pdfUrl: text("pdf_url"),
    /** KEP ile gönderim (49 TL opsiyonel hizmet). */
    kepRecipient: varchar("kep_recipient", { length: 200 }),
    kepSentAt: timestamp("kep_sent_at", { withTimezone: true }),
    kepFeeKurus: money("kep_fee_kurus").notNull().default(0),
    verificationCode: varchar("verification_code", { length: 20 }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("idx_debt_cert_tenant_unit").on(t.tenantId, t.unitId),
    index("idx_debt_cert_serial").on(t.serialNo),
  ],
);
