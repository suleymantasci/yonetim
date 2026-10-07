import { sql } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";

import { idCol, money, softDelete, tenantId, timestamps } from "./_shared";
import {
  documentCategoryEnum, inventoryStatusEnum, meterTypeEnum, requestPriorityEnum,
  requestStatusEnum, reservationStatusEnum, staffRoleEnum,
} from "./enums";
import { resources, units } from "./property";
import { tenants } from "./tenants";
import { users } from "./users";

/** Arıza / talep / şikayet — Bölüm 6.3. */
export const requests = pgTable(
  "requests",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    code: varchar("code", { length: 20 }).notNull(),
    category: varchar("category", { length: 40 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    priority: requestPriorityEnum("priority").notNull().default("normal"),
    status: requestStatusEnum("status").notNull().default("open"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
    assignedVendorId: uuid("assigned_vendor_id"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    costKurus: money("cost_kurus").notNull().default(0),
    photoUrls: jsonb("photo_urls").notNull().default([]),
    /** Sakin memnuniyeti (çözüm sonrası 1-5). */
    satisfactionScore: integer("satisfaction_score"),
    source: varchar("source", { length: 20 }).notNull().default("web"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("idx_requests_tenant_code").on(t.tenantId, t.code),
    index("idx_requests_tenant_status").on(t.tenantId, t.status),
    index("idx_requests_sla").on(t.tenantId, t.slaDueAt),
    index("idx_requests_unit").on(t.unitId),
  ],
);

export const requestComments = pgTable(
  "request_comments",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** Sadece yönetici/personel görür. */
    isInternal: boolean("is_internal").notNull().default(false),
    attachmentUrls: jsonb("attachment_urls").notNull().default([]),
    ...timestamps,
  },
  (t) => [index("idx_request_comments_request").on(t.requestId)],
);

/** Bakım şablon kütüphanesi (global, tenant'sız) — Bölüm 3.7. */
export const maintenanceTemplates = pgTable(
  "maintenance_templates",
  {
    id: idCol(),
    code: varchar("code", { length: 60 }).notNull(),
    equipmentType: varchar("equipment_type", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    intervalDays: integer("interval_days").notNull(),
    /** Yasal dayanak (yönetmelik referansı). */
    regulatoryRef: text("regulatory_ref"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    checklist: jsonb("checklist").notNull().default([]),
    reminderDays: jsonb("reminder_days").notNull().default([30, 15, 7, 0, -3]),
    ...timestamps,
  },
  (t) => [uniqueIndex("idx_maintenance_templates_code").on(t.code)],
);

export const maintenanceRecords = pgTable(
  "maintenance_records",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => maintenanceTemplates.id, { onDelete: "set null" }),
    equipmentType: varchar("equipment_type", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    location: varchar("location", { length: 120 }),
    vendorId: uuid("vendor_id"),
    intervalDays: integer("interval_days").notNull(),
    lastDoneAt: timestamp("last_done_at", { withTimezone: true }),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
    lastCostKurus: money("last_cost_kurus").notNull().default(0),
    documentUrl: text("document_url"),
    checklistResult: jsonb("checklist_result").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_maintenance_tenant_due").on(t.tenantId, t.nextDueAt),
  ],
);

/**
 * Bakım geçmişi — her "yapıldı" olayı bir satır.
 *
 * `maintenance_records` yalnız **son** bakımı (`last_done_at`,
 * `last_cost_kurus`) taşıyordu; tamamlama bu alanların üstüne yazdığı için
 * önceki bakımlar hiçbir yerde kalmıyordu. Yasal denetimde sorulan şey tam da
 * bu liste ("asansör son üç yılda hangi tarihlerde kontrol edildi, raporu
 * nerede"). Kayıt soft-delete edilse de geçmiş durur; satırlar düzenlenmez.
 */
export const maintenanceLogs = pgTable(
  "maintenance_logs",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => maintenanceRecords.id, { onDelete: "cascade" }),
    doneAt: timestamp("done_at", { withTimezone: true }).notNull(),
    costKurus: money("cost_kurus").notNull().default(0),
    documentUrl: text("document_url"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_maintenance_logs_record").on(t.recordId, t.doneAt),
    index("idx_maintenance_logs_tenant_done").on(t.tenantId, t.doneAt),
  ],
);

/**
 * Kargo/paket kaydı — güvenlik/kapıcı teslim alır, sakine teslim eder.
 * Teslim edilmemiş paket sayısı ekranın ana sorusu.
 */
export const parcels = pgTable(
  "parcels",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    recipientName: varchar("recipient_name", { length: 160 }).notNull(),
    carrier: varchar("carrier", { length: 60 }),
    trackingNo: varchar("tracking_no", { length: 80 }),
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredTo: varchar("delivered_to", { length: 160 }),
    deliveredBy: uuid("delivered_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("idx_parcels_tenant_open").on(t.tenantId, t.deliveredAt),
    index("idx_parcels_unit").on(t.unitId),
  ],
);

/**
 * Ziyaretçi defteri. Kişisel veri (ad, telefon, plaka): KVKK saklama süresi
 * dolunca `kvkk.retention` anonimleştirir.
 */
export const visitors = pgTable(
  "visitors",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    visitorName: varchar("visitor_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    plate: varchar("plate", { length: 20 }),
    purpose: varchar("purpose", { length: 120 }),
    note: text("note"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("idx_visitors_tenant_arrived").on(t.tenantId, t.arrivedAt),
    index("idx_visitors_unit").on(t.unitId),
  ],
);

export const vendors = pgTable(
  "vendors",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 60 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    contactName: varchar("contact_name", { length: 120 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    taxNumber: varchar("tax_number", { length: 11 }),
    taxOffice: varchar("tax_office", { length: 80 }),
    iban: varchar("iban", { length: 34 }),
    address: text("address"),
    notes: text("notes"),
    contractUrl: text("contract_url"),
    contractEndsAt: timestamp("contract_ends_at", { withTimezone: true }),
    /** Tedarikçi puanlaması (Bölüm 6.3 Gelişmiş) — 0..5. */
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }),
    ratingCount: integer("rating_count").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_vendors_tenant_category").on(t.tenantId, t.category)],
);

export const meters = pgTable(
  "meters",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
    type: meterTypeEnum("type").notNull(),
    serialNo: varchar("serial_no", { length: 60 }),
    /** Ortak alan sayacı ise unit_id null olur. */
    isCommon: boolean("is_common").notNull().default(false),
    unitPriceKurus: money("unit_price_kurus").notNull().default(0),
    initialValue: numeric("initial_value", { precision: 12, scale: 3 }).notNull().default("0"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_meters_tenant_type").on(t.tenantId, t.type),
    index("idx_meters_unit").on(t.unitId),
  ],
);

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    meterId: uuid("meter_id").notNull().references(() => meters.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 7 }).notNull(),
    previousValue: numeric("previous_value", { precision: 12, scale: 3 }).notNull(),
    currentValue: numeric("current_value", { precision: 12, scale: 3 }).notNull(),
    consumption: numeric("consumption", { precision: 12, scale: 3 }).notNull(),
    amountKurus: money("amount_kurus").notNull().default(0),
    readingDate: timestamp("reading_date", { withTimezone: true }).notNull(),
    photoUrl: text("photo_url"),
    /** OCR ile okunduysa güven skoru (Bölüm 9.2). */
    ocrConfidence: numeric("ocr_confidence", { precision: 4, scale: 3 }),
    /** Anomali uyarısı (Bölüm 6.9 Gelişmiş). */
    anomalyFlag: boolean("anomaly_flag").notNull().default(false),
    readBy: uuid("read_by").references(() => users.id, { onDelete: "set null" }),
    /**
     * Tüketim borçlandırıldıysa oluşan borç. Dolu okuma **kilitli**:
     * düzeltilmesi borcun iptal edilip yeniden kesilmesini gerektirir, yoksa
     * sakine yansıyan tutar ile endeks birbirinden kopar.
     */
    debtId: uuid("debt_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("idx_meter_readings_meter_period").on(t.meterId, t.period),
    index("idx_meter_readings_tenant_period").on(t.tenantId, t.period),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "set null" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    guestCount: integer("guest_count").notNull().default(1),
    feeKurus: money("fee_kurus").notNull().default(0),
    depositKurus: money("deposit_kurus").notNull().default(0),
    depositReturnedAt: timestamp("deposit_returned_at", { withTimezone: true }),
    status: reservationStatusEnum("status").notNull().default("pending"),
    /** Ücret borç olarak yansıtıldıysa. */
    debtId: uuid("debt_id"),
    note: text("note"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    ...timestamps,
  },
  (t) => [
    index("idx_reservations_resource_time").on(t.resourceId, t.startAt, t.endAt),
    index("idx_reservations_tenant_status").on(t.tenantId, t.status),
    index("idx_reservations_user").on(t.userId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    category: documentCategoryEnum("category").notNull().default("other"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    ownerType: varchar("owner_type", { length: 40 }),
    ownerId: uuid("owner_id"),
    url: text("url").notNull(),
    mimeType: varchar("mime_type", { length: 100 }),
    sizeBytes: integer("size_bytes"),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Erişim seviyesi: 'managers' | 'residents' | 'owners' | 'public' */
    visibility: varchar("visibility", { length: 20 }).notNull().default("managers"),
    /** Tam metin arama vektörü (Postgres FTS — Bölüm 6.10). */
    searchText: text("search_text"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_documents_tenant_category").on(t.tenantId, t.category),
    index("idx_documents_expires").on(t.tenantId, t.expiresAt),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    role: staffRoleEnum("role").notNull().default("kapici"),
    phone: varchar("phone", { length: 20 }),
    /** Şifreli TCKN (Bölüm 5.6). */
    tcknEncrypted: text("tckn_encrypted"),
    ibanEncrypted: text("iban_encrypted"),
    grossSalaryKurus: money("gross_salary_kurus").notNull().default(0),
    netSalaryKurus: money("net_salary_kurus").notNull().default(0),
    sgkPremiumKurus: money("sgk_premium_kurus").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    annualLeaveDays: integer("annual_leave_days").notNull().default(14),
    usedLeaveDays: integer("used_leave_days").notNull().default(0),
    advanceBalanceKurus: money("advance_balance_kurus").notNull().default(0),
    shiftPlan: jsonb("shift_plan").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("idx_staff_tenant").on(t.tenantId)],
);

/**
 * Demirbaş / envanter defteri — KMK md.34/9 ve rakip incelemesi §4.1.
 *
 * NEDEN AYRI TABLO, `documents` YA DA `maintenance_records` DEĞİL:
 *  - `documents` bir **dosya deposu**; demirbaşın kendisi bir dosya değil,
 *    fiziksel bir varlık ve sayısı/yeri/durumu değişiyor.
 *  - `maintenance_records` **periyodik bakım takvimi**; asansör her yıl
 *    bakım ister, çim biçme makinesi istemez ama ikisi de demirbaştır.
 *    İkisini birleştirmek "bakım periyodu olmayan demirbaş" için anlamsız
 *    bir `interval_days` uydurmayı gerektirirdi.
 *
 * ALIŞ BEDELİ SAKLANIYOR AMA AMORTİSMAN YOK: yönetici "ne kadar ödedik"
 * sorusunu soruyor; "defter değeri ne" sorusu mali müşavirin sorusu ve
 * muhasebe raporları modülüne (henüz ürün kararı bekliyor) ait.
 */
export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    /** Site içi envanter/demirbaş numarası — etikette yazan değer. */
    code: varchar("code", { length: 40 }),
    name: varchar("name", { length: 160 }).notNull(),
    /** `packages/contracts` `INVENTORY_CATEGORIES` ile sınırlı. */
    category: varchar("category", { length: 40 }).notNull().default("other"),
    /**
     * Nerede — serbest metin (kazan dairesi, A blok girişi, sığınak).
     * `units`'e bağlanmadı: demirbaşların çoğu ortak alanda ve ortak alanların
     * hepsi `units` satırı değil.
     */
    location: varchar("location", { length: 120 }),
    quantity: integer("quantity").notNull().default(1),
    serialNo: varchar("serial_no", { length: 80 }),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }),
    purchasePriceKurus: money("purchase_price_kurus").notNull().default(0),
    warrantyUntil: timestamp("warranty_until", { withTimezone: true }),
    status: inventoryStatusEnum("status").notNull().default("active"),
    /** Zimmetli personel — kayıt silinirse zimmet düşer, demirbaş kalır. */
    responsibleStaffId: uuid("responsible_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    photoUrls: jsonb("photo_urls").notNull().default([]),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("idx_inventory_tenant_status").on(t.tenantId, t.status),
    // Envanter numarası site içinde tekil — iki demirbaşa aynı etiketi
    // yapıştırmak sayımı imkânsız kılar. Kısmi index: numara isteğe bağlı.
    uniqueIndex("idx_inventory_tenant_code")
      .on(t.tenantId, t.code)
      .where(sql`${t.code} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

export const staffAttendance = pgTable(
  "staff_attendance",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    method: varchar("method", { length: 20 }).notNull().default("mobile"),
    latitude: varchar("latitude", { length: 20 }),
    longitude: varchar("longitude", { length: 20 }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("idx_attendance_staff_date").on(t.staffId, t.checkInAt)],
);

export const staffLeaves = pgTable(
  "staff_leaves",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).notNull().default("annual"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    days: integer("days").notNull(),
    approvedBy: uuid("approved_by"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("idx_staff_leaves_staff").on(t.staffId)],
);

/**
 * Uzun süren iş koşusu — MIMARI-PLAN §10 B3, GAP 4.1.17'nin önkoşulu.
 *
 * NEDEN VERİTABANINDA, KUYRUKTA DEĞİL: BullMQ job'ının kendi ilerleme alanı
 * var ama o Redis'te ve `removeOnComplete` ile siliniyor. "Geçen hafta yapılan
 * göçte hangi satırlar hatalıydı" sorusu haftalar sonra sorulabiliyor;
 * cevabın kalıcı olması gerek. Kuyruk çalıştırmanın aracı, kaydın yeri değil.
 *
 * İPTAL BİR **BAYRAK**: `status = 'cancelling'`. İş kendi döngüsünde bu alanı
 * okuyup temiz bir noktada duruyor. Job'ı kuyruktan silmek, yarısı yazılmış
 * bir göçü geri alınamaz halde bırakırdı.
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: idCol(),
    tenantId: tenantId().references(() => tenants.id, { onDelete: "cascade" }),
    /** `import.units`, `debt.bulk`, `report.monthly` … */
    kind: varchar("kind", { length: 60 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    /** Kuyruktaki job kimliği — iptal ve izleme için. */
    queueJobId: varchar("queue_job_id", { length: 80 }),
    startedByUserId: uuid("started_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    processed: integer("processed").notNull().default(0),
    /** Bilinmiyorsa NULL — 0 yazmak "%0 tamamlandı" gibi okunurdu. */
    total: integer("total"),
    step: varchar("step", { length: 80 }),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** Satır bazlı hatalar; ekranda ilk 50'si gösterilir. */
    errors: jsonb("errors").notNull().default([]),
    /** İşin girdisi (dosya anahtarı, filtre…) — yeniden koşturmak için. */
    input: jsonb("input").notNull().default({}),
    result: jsonb("result"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("idx_job_runs_tenant_created").on(t.tenantId, t.createdAt),
    index("idx_job_runs_status").on(t.status),
  ],
);
