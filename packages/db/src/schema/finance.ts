import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, money, softDelete, tenantId, timestamps } from "./_shared";
import {
  bankTxDirectionEnum, debtKindEnum, debtStatusEnum, duesFormulaEnum, duesPeriodEnum,
  expenseStatusEnum, paymentMethodEnum, paymentProcessorEnum, paymentStatusEnum,
} from "./enums";
import { tenants } from "./tenants";
import { units } from "./property";
import { users } from "./users";

/** Aidat tanımı — SPEC Bölüm 6.1. */
export const duesPlans = pgTable(
  "dues_plans",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    period: duesPeriodEnum("period").notNull().default("monthly"),
    formula: duesFormulaEnum("formula").notNull().default("equal"),
    /** Toplam dağıtılacak tutar (kuruş) — 'equal' dışındaki formüllerde havuz. */
    totalAmountKurus: money("total_amount_kurus"),
    /** Birim başı sabit tutar (kuruş) — 'equal' formülünde. */
    baseAmountKurus: money("base_amount_kurus"),
    /** Karma formül ağırlıkları: { equal: 50, land_share: 50 }. */
    mixWeights: jsonb("mix_weights").notNull().default({}),
    dueDayOfMonth: integer("due_day_of_month").notNull().default(10),
    /** Blok/birim tipi filtresi (null = tüm birimler). */
    appliesTo: jsonb("applies_to").notNull().default({}),
    lateFeeMonthlyPct: numeric("late_fee_monthly_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("5"),
    /**
     * Gecikme tazminatı günlük mü işlesin — GAP 4.1.3 / Q4.
     *
     * Varsayılan aylık (false): KMK md.20 aylık %5 üst sınırını bu dille
     * koyuyor ve yönetim planlarının çoğu böyle yazılı. Günlük açıldığında
     * aylık oran 30'a bölünür — üst sınır aşılmaz, yalnız daha adil dağılır
     * (ayın 2'sinde ödeyen ile 29'unda ödeyen aynı faizi ödemez).
     */
    lateFeeDailyMode: boolean("late_fee_daily_mode").notNull().default(false),
    startPeriod: varchar("start_period", { length: 7 }).notNull(),
    endPeriod: varchar("end_period", { length: 7 }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_dues_plans_tenant").on(t.tenantId),
    index("idx_dues_plans_active").on(t.tenantId, t.isActive),
  ],
);

/** Dönem bazlı borçlandırma çalışması (idempotent üretim anahtarı). */
export const duesRuns = pgTable(
  "dues_runs",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    duesPlanId: uuid("dues_plan_id").notNull().references(() => duesPlans.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(),
    generatedCount: integer("generated_count").notNull().default(0),
    totalKurus: money("total_kurus").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("completed"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_dues_runs_plan_period").on(t.duesPlanId, t.period),
    index("idx_dues_runs_tenant").on(t.tenantId),
  ],
);

/** Borç kaydı (daire bazlı). */
export const debts = pgTable(
  "debts",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
    /** Borcun yükümlüsü (malik veya kiracı) — Bölüm 6.1 borç paylaşımı. */
    debtorUserId: uuid("debtor_user_id").references(() => users.id, { onDelete: "set null" }),
    duesPlanId: uuid("dues_plan_id").references(() => duesPlans.id, { onDelete: "set null" }),
    duesRunId: uuid("dues_run_id").references(() => duesRuns.id, { onDelete: "set null" }),
    kind: debtKindEnum("kind").notNull().default("dues"),
    period: varchar("period", { length: 7 }),
    description: varchar("description", { length: 200 }).notNull(),
    amountKurus: money("amount_kurus").notNull(),
    paidKurus: money("paid_kurus").notNull().default(0),
    lateFeeKurus: money("late_fee_kurus").notNull().default(0),
    /** Gecikme tazminatının en son hesaplandığı gün (idempotans). */
    lateFeeCalculatedAt: timestamp("late_fee_calculated_at", { withTimezone: true }),
    /**
     * Bu borca gecikme tazminatı işlemez — GAP 4.2.5.
     * Taksitlendirilen, dava konusu olan veya yönetim kararıyla dondurulan
     * borçlarda kullanılır; gerekçe `metadata.lateFeeExemptReason`'a yazılır.
     */
    lateFeeExempt: boolean("late_fee_exempt").notNull().default(false),
    /** Taksit planı üst kaydı (bu borç bir taksitse). */
    parentDebtId: uuid("parent_debt_id"),
    /** Taksit sırası (1/12, 2/12 …); tek seferlik borçta null. */
    installmentNo: integer("installment_no"),
    installmentCount: integer("installment_count"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: debtStatusEnum("status").notNull().default("pending"),
    /** İcra sürecine devredildiyse. */
    legalCaseId: uuid("legal_case_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_debts_tenant_unit").on(t.tenantId, t.unitId),
    index("idx_debts_status_due").on(t.tenantId, t.status, t.dueDate),
    index("idx_debts_debtor").on(t.debtorUserId),
    index("idx_debts_period").on(t.tenantId, t.period),
  ],
);

/**
 * Aidat/borç değişiklik timeline'ı — VURUCU ÖZELLİK (Bölüm 1.2 + 3).
 * Bu tablo append-only'dir: UPDATE/DELETE trigger ile engellenir (bkz. rls.sql).
 */
export const debtChanges = pgTable(
  "audit_debt_changes",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    changeType: varchar("change_type", { length: 30 }).notNull(),
    oldAmountKurus: money("old_amount_kurus"),
    newAmountKurus: money("new_amount_kurus"),
    oldDueDate: timestamp("old_due_date", { withTimezone: true }),
    newDueDate: timestamp("new_due_date", { withTimezone: true }),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    /** Sakine görünür mü (şeffaflık ilkesi — Bölüm 1.2). */
    visibleToResident: boolean("visible_to_resident").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_debt_changes_debt").on(t.debtId),
    index("idx_debt_changes_tenant_created").on(t.tenantId, t.createdAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    payerUserId: uuid("payer_user_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * Borcun yükümlüsü — GAP 4.2.8.
     *
     * Ödeyen ile borçlu farklı olabilir: kiracı malikin borcunu öder, çocuk
     * ebeveynin aidatını yatırır. İki alanı ayırmak iki şeyi mümkün kılıyor:
     * (1) malik kendi cari hesabında ödemeyi görebilir, (2) "borçlu değilken
     * ödedi" durumu makbuzda ve denetim kütüğünde açıkça durur.
     * Null ise ödeyen aynı zamanda borçludur.
     */
    debtorUserId: uuid("debtor_user_id").references(() => users.id, { onDelete: "set null" }),
    amountKurus: money("amount_kurus").notNull(),
    /**
     * Paranın girdiği hesap — nakit dışı tahsilatta hangi banka hesabına
     * yattığı.
     *
     * NEDEN GEREKLİ: `method` "havale" diyor ama hangi hesaba yattığını
     * söylemiyordu. Site birden fazla hesap tutuyor (aidat, demirbaş,
     * proje) ve mutabakat "bu ödeme hangi hesabın ekstresinde görünmeli"
     * sorusunu cevaplayamıyordu; eşleştirme yalnız tutar ve tarihle
     * yapılıyor, iki hesapta aynı gün aynı tutar varsa yanlış eşleşiyordu.
     *
     * Nakit tahsilatta **null**: kasaya giren paranın banka hesabı yok ve
     * uydurma bir hesap seçtirmek mutabakatı bozardı.
     */
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    /** Şeffaf komisyon göstergesi (Bölüm 1.2). */
    platformFeeKurus: money("platform_fee_kurus").notNull().default(0),
    processorFeeKurus: money("processor_fee_kurus").notNull().default(0),
    method: paymentMethodEnum("method").notNull(),
    processor: paymentProcessorEnum("processor").notNull().default("manual"),
    processorRef: varchar("processor_ref", { length: 120 }),
    conversationId: varchar("conversation_id", { length: 120 }),
    status: paymentStatusEnum("status").notNull().default("initiated"),
    installment: integer("installment").notNull().default(1),
    cardLast4: varchar("card_last4", { length: 4 }),
    cardBrand: varchar("card_brand", { length: 20 }),
    receiptUrl: text("receipt_url"),
    receiptNo: varchar("receipt_no", { length: 30 }),
    failureReason: text("failure_reason"),
    refundedKurus: money("refunded_kurus").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Idempotency — webhook tekrarına karşı. */
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("idx_payments_tenant_paid").on(t.tenantId, t.paidAt),
    uniqueIndex("idx_payments_processor_ref").on(t.processor, t.processorRef),
    uniqueIndex("idx_payments_idempotency").on(t.idempotencyKey),
    index("idx_payments_unit").on(t.unitId),
    index("idx_payments_status").on(t.tenantId, t.status),
  ],
);

/** Bir ödeme birden çok borca dağıtılabilir (kısmi tahsilat). */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull().references(() => debts.id, { onDelete: "cascade" }),
    amountKurus: money("amount_kurus").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_alloc_payment").on(t.paymentId),
    index("idx_alloc_debt").on(t.debtId),
    // H-12: Aynı ödeme aynı borca iki kez mahsup edilemesin. İyzico
    // webhook'unun SERIALIZABLE olmayan transaction'ında ikinci insert
    // DB tarafından reddedilir; `ON CONFLICT DO NOTHING` ile controller
    // tarafı da idempotent.
    uniqueIndex("uq_alloc_payment_debt").on(t.paymentId, t.debtId),
  ],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /**
     * Hiyerarşi — GAP 4.2.1. "Personel Maaşı > Kapıcı" gibi iki seviye.
     * `depth` denormalize tutulur: ağaç sorgusu (recursive CTE) yerine
     * tek seviyeli sıralama yeterli olsun; iki seviye ile sınırlıyoruz
     * (0 = kök, 1 = alt kategori) — daha derini yönetici için kullanışsız.
     */
    parentId: uuid("parent_id"),
    depth: integer("depth").notNull().default(0),
    /**
     * Bu kategorinin gideri dairelere hangi formülle yansır (varsayılan).
     * Gider kaydı bunu ezebilir; kategori yalnız makul başlangıcı verir.
     */
    distribution: duesFormulaEnum("distribution").notNull().default("equal"),
    isShared: boolean("is_shared").notNull().default(true),
    /** Lucide ikon adı (örn. "Wrench"). Arayüz bilinmeyen adı yok sayar. */
    icon: varchar("icon", { length: 40 }),
    color: varchar("color", { length: 9 }),
    /** Varsayılan KDV oranı (0.20 = %20); gider formunda ön dolu gelir. */
    defaultVatRate: numeric("default_vat_rate", { precision: 4, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_expense_categories_tenant").on(t.tenantId),
    uniqueIndex("idx_expense_categories_tenant_name").on(t.tenantId, t.name),
    index("idx_expense_categories_parent").on(t.parentId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id"),
    vendorName: varchar("vendor_name", { length: 160 }),
    /**
     * Personel ödemesi: maaş (`salary`) ya da avans (`advance`). Ödeme gider
     * olarak kalıyor (kasa dökümü ve dairelere dağıtım aynen çalışsın);
     * personel carisi bu bağdan okunuyor. FK SQL'de (staff → operations).
     */
    staffId: uuid("staff_id"),
    staffKind: varchar("staff_kind", { length: 20 }),
    description: varchar("description", { length: 240 }).notNull(),
    amountKurus: money("amount_kurus").notNull(),
    vatRate: numeric("vat_rate", { precision: 4, scale: 2 }).notNull().default("0.20"),
    vatKurus: money("vat_kurus").notNull().default(0),
    /** Stopaj (personel/kira giderlerinde) — Bölüm 6.2. */
    withholdingKurus: money("withholding_kurus").notNull().default(0),
    invoiceNo: varchar("invoice_no", { length: 60 }),
    /** GİB e-Fatura UUID (Bölüm 7.6). */
    einvoiceUuid: varchar("einvoice_uuid", { length: 60 }),
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidVia: varchar("paid_via", { length: 40 }),
    bankAccountId: uuid("bank_account_id"),
    attachmentUrl: text("attachment_url"),
    status: expenseStatusEnum("status").notNull().default("approved"),
    /** Bu gider sakinlere yansıtıldı mı (borçlandırma). */
    distributedAt: timestamp("distributed_at", { withTimezone: true }),
    period: varchar("period", { length: 7 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_expenses_tenant_date").on(t.tenantId, t.expenseDate),
    index("idx_expenses_category").on(t.categoryId),
    index("idx_expenses_period").on(t.tenantId, t.period),
  ],
);

/** Bütçe (plan) — bütçe vs gerçekleşen (Bölüm 6.2). */
export const budgets = pgTable(
  "budgets",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "cascade" }),
    plannedKurus: money("planned_kurus").notNull().default(0),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_budgets_tenant_year_cat").on(t.tenantId, t.year, t.categoryId)],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    bankName: varchar("bank_name", { length: 80 }).notNull(),
    /** IBAN şifreli saklanır (Bölüm 5.6). */
    ibanEncrypted: text("iban_encrypted").notNull(),
    ibanMasked: varchar("iban_masked", { length: 40 }).notNull(),
    ibanIndex: varchar("iban_index", { length: 64 }),
    accountName: varchar("account_name", { length: 160 }),
    purpose: varchar("purpose", { length: 40 }).notNull().default("dues"),
    provider: varchar("provider", { length: 40 }),
    providerRef: varchar("provider_ref", { length: 120 }),
    balanceKurus: money("balance_kurus").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: varchar("sync_status", { length: 20 }).notNull().default("idle"),
    syncError: text("sync_error"),
    /**
     * Döküm içe aktarma eşleştirmesi (başlık adı → alan). Bankanın dökümü
     * her ay aynı geldiği için ilk yüklemede yapılan düzeltme saklanır,
     * sonrakinde önizleme doğrudan doğru gelir (`@yonetim/bank` profil).
     */
    importProfile: jsonb("import_profile"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_bank_accounts_tenant").on(t.tenantId)],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => bankAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 120 }).notNull(),
    direction: bankTxDirectionEnum("direction").notNull(),
    amountKurus: money("amount_kurus").notNull(),
    balanceAfterKurus: money("balance_after_kurus"),
    counterparty: varchar("counterparty", { length: 200 }),
    counterpartyIban: varchar("counterparty_iban", { length: 40 }),
    description: text("description"),
    /** Gönderenin yazdığı açıklama (dökümün ham açıklamasından ayrılmış). */
    payerNote: text("payer_note"),
    transactionAt: timestamp("transaction_at", { withTimezone: true }).notNull(),
    matchedPaymentId: uuid("matched_payment_id").references(() => payments.id, { onDelete: "set null" }),
    matchedUnitId: uuid("matched_unit_id").references(() => units.id, { onDelete: "set null" }),
    /** Çıkan hareket gider olarak kaydedildiyse (`match_status = 'expense'`). */
    matchedExpenseId: uuid("matched_expense_id").references(() => expenses.id, { onDelete: "set null" }),
    /** 'unmatched' | 'suggested' | 'auto' | 'manual' | 'expense' | 'ignored' */
    matchStatus: varchar("match_status", { length: 20 }).notNull().default("unmatched"),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    /** Önerinin gerekçeleri (`MatchReason[]`) — kuyrukta yöneticiye gösterilir. */
    matchReasons: jsonb("match_reasons"),
    provider: varchar("provider", { length: 40 }).notNull(),
    raw: jsonb("raw").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_bank_tx_external").on(t.accountId, t.externalId),
    index("idx_bank_tx_tenant_date").on(t.tenantId, t.transactionAt),
    index("idx_bank_tx_match_status").on(t.tenantId, t.matchStatus),
  ],
);

/** Mutabakat kuyruğu — webhook/polling farkları (Bölüm 3.10). */
export const reconciliationIssues = pgTable(
  "reconciliation_issues",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull().default("warning"),
    paymentId: uuid("payment_id"),
    bankTransactionId: uuid("bank_transaction_id"),
    expectedKurus: money("expected_kurus"),
    actualKurus: money("actual_kurus"),
    detail: jsonb("detail").notNull().default({}),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    retryCount: integer("retry_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("idx_recon_tenant_open").on(t.tenantId, t.resolvedAt),
  ],
);

/**
 * Açılış fişi — sisteme geçişten önceki kasa, banka ve tedarikçi bakiyeleri.
 *
 * Sakin devir borçları gerçek borç olarak (`debts.metadata.opening`), personel
 * açılışı personel defterinde tutuluyor: ikisi de tahsil/ödeme akışına giren
 * kalemler. Buradaki satırlar yalnız muhasebe açılışı; hepsi aynı
 * `as_of_date`'i taşıyor (servis zorunlu kılıyor).
 *
 * `account`: `cash` (kasa, tek satır) · `bank` (`bank_account_id`) ·
 * `vendor` (`vendor_id`, tedarikçiye borç).
 */
export const openingEntries = pgTable(
  "opening_entries",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
    account: varchar("account", { length: 20 }).notNull(),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id"),
    amountKurus: money("amount_kurus").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("idx_opening_entries_tenant").on(t.tenantId)],
);

/**
 * Kasa hareketleri — tahakkuksuz para hareketleri.
 *
 *  - `transfer` (virman): kasa ↔ banka ya da banka ↔ banka. Gelir/gider değil.
 *  - `income` (harici tahsilat): aidat dışı gelir — kira, reklam, faiz, bağış.
 *    Sakin borcuna bağlı değil; borcu olmayan bir gelir için sahte borç
 *    açmak alacak hesabını şişirirdi.
 *
 * Silinmiyor, iptal ediliyor (`voided_at`): defterden iz kaybolmasın.
 * Hesap tarafı: `*_account` = "cash" | "bank"; banka ise `*_bank_account_id`.
 */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    movementDate: timestamp("movement_date", { withTimezone: true }).notNull(),
    amountKurus: money("amount_kurus").notNull(),
    fromAccount: varchar("from_account", { length: 10 }),
    fromBankAccountId: uuid("from_bank_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
    toAccount: varchar("to_account", { length: 10 }).notNull(),
    toBankAccountId: uuid("to_bank_account_id").references(() => bankAccounts.id, { onDelete: "restrict" }),
    incomeCategory: varchar("income_category", { length: 30 }),
    payerName: varchar("payer_name", { length: 160 }),
    description: text("description"),
    documentNo: varchar("document_no", { length: 60 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    ...timestamps,
  },
  (t) => [index("idx_cash_movements_tenant_date").on(t.tenantId, t.movementDate)],
);

/**
 * Kasa devir tutanağı — yönetim değişiminde kasa/banka/alacak/borç
 * bakiyelerinin o anki fotoğrafı. Muhasebe kaydı doğurmaz; `snapshot`
 * tutanak imzalandığı andaki rakamları saklar (sonradan girilen geriye dönük
 * kayıtlar imzalı tutanağı değiştirmesin).
 */
export const cashHandovers = pgTable(
  "cash_handovers",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    handoverDate: timestamp("handover_date", { withTimezone: true }).notNull(),
    fromName: varchar("from_name", { length: 160 }).notNull(),
    toName: varchar("to_name", { length: 160 }).notNull(),
    note: text("note"),
    snapshot: jsonb("snapshot").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("idx_cash_handovers_tenant").on(t.tenantId, t.handoverDate)],
);

/**
 * İşletme projesi (KMK 37) — dönem bütçesi ve kat maliklerine dağıtımı.
 *
 * Dönem ay cinsinden (`YYYY-MM`..`YYYY-MM`). `reserve_pct`: öngörülemeyen
 * giderler için yedek pay; toplam = kalemler × (1 + yedek). Onaylanan proje
 * değiştirilemez (genel kurul kararı); yenisi yazılır.
 */
export const operatingBudgets = pgTable(
  "operating_budgets",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    startPeriod: varchar("start_period", { length: 7 }).notNull(),
    endPeriod: varchar("end_period", { length: 7 }).notNull(),
    formula: varchar("formula", { length: 20 }).notNull().default("land_share"),
    mixEqualPct: integer("mix_equal_pct").notNull().default(50),
    reservePct: numeric("reserve_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalNote: text("approval_note"),
    duesPlanId: uuid("dues_plan_id").references(() => duesPlans.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_operating_budgets_tenant").on(t.tenantId, t.startPeriod)],
);

export const operatingBudgetLines = pgTable(
  "operating_budget_lines",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id").notNull().references(() => operatingBudgets.id, { onDelete: "cascade" }),
    /** Gerçekleşen karşılaştırması bu kategoriden; boşsa kalem yalnız plan. */
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    /** Personel giderleri: gerçekleşen personel defterindeki tahakkuklardan. */
    isStaff: boolean("is_staff").notNull().default(false),
    label: varchar("label", { length: 160 }).notNull(),
    plannedKurus: money("planned_kurus").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("idx_operating_budget_lines_budget").on(t.budgetId)],
);
