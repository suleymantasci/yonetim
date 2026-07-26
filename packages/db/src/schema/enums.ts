import { pgEnum } from "drizzle-orm/pg-core";

export const tenantTypeEnum = pgEnum("tenant_type", [
  "apartment", "site", "residence", "plaza", "avm", "office", "vakif", "dernek",
]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "trial", "active", "past_due", "suspended", "archived", "cancelled",
]);

export const roleEnum = pgEnum("user_role", [
  "super_admin", "support_agent", "company_admin", "company_operator",
  "manager", "auditor", "accountant", "staff", "owner", "tenant_resident",
]);

export const unitTypeEnum = pgEnum("unit_type", [
  "flat", "shop", "office", "depot", "garage", "villa", "common_area",
]);

export const ownershipTypeEnum = pgEnum("ownership_type", ["owner", "tenant", "vacant"]);

/** Borçlandırma formülü — SPEC Bölüm 6.1. */
export const duesFormulaEnum = pgEnum("dues_formula", [
  "equal", // eşit
  "land_share", // arsa payı
  "area", // m² bazlı
  "person_count", // kişi sayısı
  "meter", // sayaç endeksi
  "mixed", // karma (%X eşit + %Y arsa payı)
  "custom", // birim bazlı manuel
]);

export const duesPeriodEnum = pgEnum("dues_period", [
  "monthly", "quarterly", "semiannual", "yearly", "one_time",
]);

export const debtStatusEnum = pgEnum("debt_status", [
  "pending", "partial", "paid", "overdue", "in_legal", "written_off", "cancelled",
]);

export const debtKindEnum = pgEnum("debt_kind", [
  "dues", "utility", "reservation", "penalty", "late_fee", "extra", "legal_cost",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "card", "bank_transfer", "auto_debit", "cash", "credit_balance", "offset",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "initiated", "pending_3ds", "authorized", "completed", "failed", "refunded", "chargeback",
]);

export const paymentProcessorEnum = pgEnum("payment_processor", [
  "iyzico", "paytr", "param", "manual", "bank",
]);

export const channelEnum = pgEnum("channel", [
  "whatsapp", "sms", "email", "push", "in_app", "voice",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "queued", "scheduled", "sent", "delivered", "read", "failed", "cancelled",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "open", "assigned", "in_progress", "waiting_resident", "resolved", "closed", "rejected",
]);

export const requestPriorityEnum = pgEnum("request_priority", [
  "critical", "high", "normal", "low",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending", "approved", "rejected", "cancelled", "completed", "no_show",
]);

export const meterTypeEnum = pgEnum("meter_type", [
  "water", "hot_water", "gas", "electric", "heat_calorimeter",
]);

export const legalStageEnum = pgEnum("legal_stage", [
  "warning_letter", // ihtarname
  "notice_served", // tebligat
  "lawsuit", // dava
  "judgment", // ilam
  "enforcement", // icra
  "seizure", // haciz
  "collection", // tahsilat
  "closed",
]);

export const kvkkRequestTypeEnum = pgEnum("kvkk_request_type", [
  "access", // md.11 bilgi talebi
  "rectification", // düzeltme
  "erasure", // md.7 silme
  "objection", // itiraz
  "portability", // taşınabilirlik
]);

export const kvkkRequestStatusEnum = pgEnum("kvkk_request_status", [
  "received", "in_progress", "fulfilled", "rejected", "expired",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing", "active", "past_due", "grace", "suspended", "cancelled", "archived",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft", "issued", "paid", "overdue", "void", "refunded",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft", "active", "paused", "expired",
]);

export const campaignTypeEnum = pgEnum("campaign_type", [
  "free_trial_extension", "x_months_free", "x_percent_off", "x_amount_off",
  "free_first_period", "referral_reward", "partner_bundled", "migration_credit", "custom",
]);

export const pollVisibilityEnum = pgEnum("poll_visibility", ["open", "secret"]);

export const pollWeightEnum = pgEnum("poll_weight", ["equal", "land_share"]);

/** KMK md.31/32 karar yeter sayıları — SPEC Bölüm 6.5. */
export const quorumRuleEnum = pgEnum("quorum_rule", [
  "simple_majority", // salt çoğunluk
  "absolute_majority", // kat malikleri tam sayısının salt çoğunluğu
  "two_thirds", // 4/5 dışındaki nitelikli çoğunluk
  "four_fifths", // md.44 gibi
  "unanimous", // oybirliği
]);

export const documentCategoryEnum = pgEnum("document_category", [
  "contract", "license", "meeting_minutes", "invoice", "maintenance_report",
  "management_plan", "insurance", "legal", "kvkk", "identity", "other",
]);

export const expenseStatusEnum = pgEnum("expense_status", [
  "draft", "pending_approval", "approved", "paid", "rejected",
]);

export const bankTxDirectionEnum = pgEnum("bank_tx_direction", ["in", "out"]);

export const staffRoleEnum = pgEnum("staff_role", [
  "kapici", "guvenlik", "temizlik", "bahcivan", "teknik", "diger",
]);
