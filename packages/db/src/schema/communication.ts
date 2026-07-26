import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, money, softDelete, tenantId, timestamps } from "./_shared";
import {
  channelEnum, notificationStatusEnum, pollVisibilityEnum, pollWeightEnum, quorumRuleEnum,
} from "./enums";
import { units } from "./property";
import { tenants } from "./tenants";
import { users } from "./users";

export const announcements = pgTable(
  "announcements",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** 'all' | 'owners' | 'tenants' | 'block' | 'units' | 'new_residents' */
    audience: varchar("audience", { length: 20 }).notNull().default("all"),
    audienceFilter: jsonb("audience_filter").notNull().default({}),
    channels: jsonb("channels").notNull().default(["in_app"]),
    isUrgent: boolean("is_urgent").notNull().default(false),
    attachmentUrls: jsonb("attachment_urls").notNull().default([]),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** KVKK filtresi sonucu (Bölüm 6.4) — engellenmişse yayınlanamaz. */
    kvkkFlagged: boolean("kvkk_flagged").notNull().default(false),
    kvkkFindings: jsonb("kvkk_findings").notNull().default([]),
    /** A/B testi varyantı (Bölüm 6.4 Gelişmiş). */
    variant: varchar("variant", { length: 4 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_announcements_tenant_published").on(t.tenantId, t.publishedAt),
  ],
);

export const announcementReads = pgTable(
  "announcement_reads",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_ann_reads_unique").on(t.announcementId, t.userId)],
);

export const polls = pgTable(
  "polls",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id"),
    question: text("question").notNull(),
    description: text("description"),
    options: jsonb("options").notNull().default([]),
    /** Oy ağırlığı: eşit veya arsa payı (KMK md.31). */
    weightMode: pollWeightEnum("weight_mode").notNull().default("equal"),
    quorumRule: quorumRuleEnum("quorum_rule").notNull().default("simple_majority"),
    visibility: pollVisibilityEnum("visibility").notNull().default("open"),
    allowMultiple: boolean("allow_multiple").notNull().default(false),
    /** Sadece malikler oy kullanabilir (KMK). */
    ownersOnly: boolean("owners_only").notNull().default(true),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull().defaultNow(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resultJson: jsonb("result_json"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_polls_tenant_closes").on(t.tenantId, t.closesAt)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    /** Gizli oylamada null bırakılır, hash tutulur. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    voterHash: varchar("voter_hash", { length: 64 }),
    optionId: varchar("option_id", { length: 40 }).notNull(),
    weight: numeric("weight", { precision: 12, scale: 6 }).notNull().default("1"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_poll_votes_unique_unit").on(t.pollId, t.unitId),
    index("idx_poll_votes_poll").on(t.pollId),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    /** 'ordinary' (olağan) | 'extraordinary' (olağanüstü) */
    kind: varchar("kind", { length: 20 }).notNull().default("ordinary"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** İlk toplantıda çoğunluk sağlanmazsa ikinci toplantı (KMK md.30). */
    secondCallAt: timestamp("second_call_at", { withTimezone: true }),
    location: varchar("location", { length: 200 }),
    onlineUrl: text("online_url"),
    agenda: jsonb("agenda").notNull().default([]),
    attendees: jsonb("attendees").notNull().default([]),
    /** Katılan arsa payı toplamı / toplam (yeter sayı hesabı). */
    attendanceShare: numeric("attendance_share", { precision: 6, scale: 4 }),
    quorumMet: boolean("quorum_met"),
    minutesUrl: text("minutes_url"),
    status: varchar("status", { length: 20 }).notNull().default("planned"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_meetings_tenant_date").on(t.tenantId, t.scheduledAt)],
);

export const meetingDecisions = pgTable(
  "meeting_decisions",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    decisionNo: integer("decision_no").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    quorumRule: quorumRuleEnum("quorum_rule").notNull().default("simple_majority"),
    votesFor: numeric("votes_for", { precision: 12, scale: 6 }).notNull().default("0"),
    votesAgainst: numeric("votes_against", { precision: 12, scale: 6 }).notNull().default("0"),
    abstentions: numeric("abstentions", { precision: 12, scale: 6 }).notNull().default("0"),
    passed: boolean("passed").notNull().default(false),
    /** Karar defteri sırası (PDF çıktısı). */
    ledgerPageNo: integer("ledger_page_no"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_decisions_meeting_no").on(t.meetingId, t.decisionNo),
  ],
);

/** Uygulama içi + WhatsApp mesaj günlüğü — Bölüm 6.11. */
export const messages = pgTable(
  "messages",
  {
    id: idCol(),
    /**
     * Tanınmayan bir numaradan gelen WhatsApp mesajı henüz bir siteyle
     * eşleşmemiş olabilir; bu yüzden nullable. RLS gereği NULL satırlar
     * tenant bağlamında görünmez, yalnızca platform tarafından okunur.
     */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: channelEnum("channel").notNull().default("in_app"),
    direction: varchar("direction", { length: 3 }).notNull(),
    body: text("body"),
    mediaUrl: text("media_url"),
    /** WhatsApp mesaj id'si vb. */
    externalId: varchar("external_id", { length: 120 }),
    /** Bot state machine durumu (Bölüm 3.2). */
    intent: varchar("intent", { length: 40 }),
    intentConfidence: numeric("intent_confidence", { precision: 4, scale: 3 }),
    handledByBot: boolean("handled_by_bot").notNull().default(false),
    meta: jsonb("meta").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("idx_messages_tenant_created").on(t.tenantId, t.createdAt),
    index("idx_messages_thread").on(t.threadId),
    uniqueIndex("idx_messages_external").on(t.externalId),
  ],
);

/** WhatsApp konuşma durumu (state machine + 24 saat service window). */
export const conversationStates = pgTable(
  "conversation_states",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    phone: varchar("phone", { length: 20 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    state: varchar("state", { length: 40 }).notNull().default("idle"),
    slots: jsonb("slots").notNull().default({}),
    lastIntent: varchar("last_intent", { length: 40 }),
    /** Meta service window bitişi — bu ana kadar cevaplar ücretsiz (Bölüm 7.5). */
    serviceWindowEndsAt: timestamp("service_window_ends_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_conversation_phone").on(t.phone)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: idCol(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: channelEnum("channel").notNull(),
    template: varchar("template", { length: 60 }).notNull(),
    /** Şablon değişkenleri. */
    params: jsonb("params").notNull().default({}),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    body: text("body"),
    status: notificationStatusEnum("status").notNull().default("queued"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    provider: varchar("provider", { length: 40 }),
    providerRef: varchar("provider_ref", { length: 120 }),
    /** Maliyet takibi (Bölüm 8.3 + 15.4). */
    costKurus: money("cost_kurus").notNull().default(0),
    /** İlişkili kaynak (duyuru, borç, talep...). */
    resourceType: varchar("resource_type", { length: 40 }),
    resourceId: uuid("resource_id"),
    ...timestamps,
  },
  (t) => [
    index("idx_notifications_tenant_created").on(t.tenantId, t.createdAt),
    index("idx_notifications_status_sched").on(t.status, t.scheduledFor),
    index("idx_notifications_user").on(t.userId),
  ],
);

/** NPS otomasyonu — Bölüm 3.8. */
export const npsResponses = pgTable(
  "nps_responses",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    period: varchar("period", { length: 7 }).notNull(),
    score: integer("score").notNull(),
    comment: text("comment"),
    /** AI kümeleme sonucu tema etiketi (ayda 1 çalışır). */
    theme: varchar("theme", { length: 60 }),
    channel: channelEnum("channel").notNull().default("whatsapp"),
    ...timestamps,
  },
  (t) => [
    index("idx_nps_tenant_period").on(t.tenantId, t.period),
    uniqueIndex("idx_nps_user_period").on(t.userId, t.period),
  ],
);
