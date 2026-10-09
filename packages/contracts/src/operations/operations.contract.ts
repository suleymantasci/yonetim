import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * `operations` bağlamı — talep, bakım, rezervasyon, sayaç (MIMARI-PLAN §6.3).
 *
 * Dört ekran da aynı deseni izliyor: liste + üstünde birkaç sayaç. Sayaçlar
 * **sunucuda** hesaplanıyor (§9a): "SLA aşıldı" ve "gecikmiş bakım" gibi
 * ölçüler zaman karşılaştırması istiyor ve ölçüt `now()` sunucunun saati
 * olmalı. İstemcide hesaplansaydı, saati şaşmış bir tarayıcı tam da
 * "gecikti mi" sorusunda yanlış cevap verirdi.
 */

/* ------------------------------------------------------------------ *
 * Talepler (arıza/şikâyet) — SLA takibi
 * ------------------------------------------------------------------ */

export const requestRow = z.object({
  id: uuid,
  code: z.string(),
  title: z.string(),
  category: z.string(),
  priority: z.enum(["critical", "high", "normal", "low"]),
  status: z.string(),
  slaDueAt: dateTime.nullable(),
  resolvedAt: dateTime.nullable(),
  costMinor: moneyMinor,
  createdAt: dateTime,
  /** SLA aşıldı mı — sunucu saatine göre; ekran bunu hesaplamıyor. */
  slaBreached: z.boolean(),
});

/** Atanabilecek kişiler — sakinler değil, yönetim/görevli üyelikleri. */
export const requestAssigneeOption = z.object({
  id: uuid,
  name: z.string(),
  role: z.string(),
});

export const requestListResponse = z.object({
  rows: z.array(requestRow),
  /** Form `<select>`'lerini beslemek için: ekran ikinci çağrı yapmıyor (§9a). */
  assignees: z.array(requestAssigneeOption),
  units: z.array(z.object({ id: uuid, number: z.string(), blockName: z.string().nullable() })),
  totals: z.object({
    open: z.number().int(),
    breached: z.number().int(),
    resolved: z.number().int(),
    /** Ortalama çözüm süresi (saat); çözülmüş talep yoksa 0. */
    avgResolutionHours: z.number().int(),
  }),
});

export type RequestListResponse = z.infer<typeof requestListResponse>;

/* ------------------------------------------------------------------ *
 * Talepler — yazma
 * ------------------------------------------------------------------ */

export const REQUEST_CATEGORIES = [
  "asansor",
  "su",
  "elektrik",
  "dogalgaz",
  "ortak_alan",
  "guvenlik",
  "temizlik",
  "hasere",
  "diger",
] as const;
export const requestCategory = z.enum(REQUEST_CATEGORIES);

export const REQUEST_PRIORITIES = ["critical", "high", "normal", "low"] as const;
export const requestPriority = z.enum(REQUEST_PRIORITIES);

export const REQUEST_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_resident",
  "resolved",
  "closed",
  "rejected",
] as const;
export const requestStatus = z.enum(REQUEST_STATUSES);

/**
 * `POST /v1/panel/operations/requests` (yeni),
 * `PATCH /v1/panel/operations/requests/:id` (güncelle).
 *
 * `code` VE `slaDueAt` **GÖNDERİLMİYOR**, ikisi de sunucuda üretiliyor:
 *  - Kod site içinde sürekli ve tekil olmalı; istemciye bırakmak iki
 *    yöneticinin aynı numarayı üretmesine izin verirdi.
 *  - SLA vadesi önceliğe bağlı bir **söz** (`siteConfig.sla`) ve o sözün
 *    ölçütü sunucunun saati. İstemcide hesaplanan bir vade, saati şaşmış bir
 *    tarayıcıda "geciktik mi" sorusunu yanlış cevaplardı — hem de yanlış
 *    olmasının en pahalı olduğu yerde.
 *
 * `status` DA BURADA DEĞİL: durum geçişinin yan etkileri var (ilk yanıt
 * zamanı, çözüm zamanı, kapanış zamanı) ve bunlar formun kaydettiği alanlar
 * değil, geçişin kendisinin ürettiği izler. Ayrı uçta (`durum`).
 */
export const requestSave = z.object({
  /** Hangi daire — ortak alan arızasında boş. */
  unitId: uuid.nullish(),
  category: requestCategory,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).nullish(),
  priority: requestPriority,
  /** Boş = atanmamış; atama ayrı uçtan da yapılabilir. */
  assignedToUserId: uuid.nullish(),
  costMinor: z.coerce.number().int().min(0).default(0),
});

export type RequestSave = z.infer<typeof requestSave>;

/**
 * Durum geçişi.
 *
 * `resolved`/`closed`/`rejected` geçişlerinde zaman damgaları sunucuda
 * yazılıyor. `resolutionNote` zorunlu değil ama kapanan bir talepte
 * "ne yapıldı" sorusunun cevabı yorum akışında kalsın diye, doluysa
 * otomatik olarak bir yorum satırına dönüşüyor.
 */
export const requestStatusPatch = z.object({
  status: requestStatus,
  resolutionNote: z.string().trim().max(2000).nullish(),
});

export type RequestStatusPatch = z.infer<typeof requestStatusPatch>;

/** Atama — `null` atamayı kaldırır. */
export const requestAssignPatch = z.object({
  assignedToUserId: uuid.nullish(),
});

export type RequestAssignPatch = z.infer<typeof requestAssignPatch>;

/**
 * Yorum.
 *
 * `isInternal` **sakine gösterilmeyen** not demek. Ayrı bir tablo yerine
 * bayrak olmasının sebebi, iç notun çoğu zaman sakine yazılan cevabın hemen
 * öncesinde/sonrasında gelmesi: iki tabloya bölmek zaman sırasını korumak
 * için her okumada birleştirme (merge) gerektirirdi.
 */
export const requestCommentCreate = z.object({
  body: z.string().trim().min(1).max(4000),
  isInternal: z.coerce.boolean().default(false),
});

export type RequestCommentCreate = z.infer<typeof requestCommentCreate>;

export const requestCommentRow = z.object({
  id: uuid,
  body: z.string(),
  isInternal: z.boolean(),
  authorName: z.string().nullable(),
  createdAt: dateTime,
});

export const requestDetail = z.object({
  id: uuid,
  code: z.string(),
  unitId: uuid.nullable(),
  unitNumber: z.string().nullable(),
  category: requestCategory,
  title: z.string(),
  description: z.string().nullable(),
  priority: requestPriority,
  status: requestStatus,
  assignedToUserId: uuid.nullable(),
  assignedToName: z.string().nullable(),
  slaDueAt: dateTime.nullable(),
  slaBreached: z.boolean(),
  firstResponseAt: dateTime.nullable(),
  resolvedAt: dateTime.nullable(),
  closedAt: dateTime.nullable(),
  costMinor: moneyMinor,
  createdAt: dateTime,
  comments: z.array(requestCommentRow),
});

export type RequestDetail = z.infer<typeof requestDetail>;

export const requestSaveResult = z.object({ id: uuid, code: z.string() });

export type RequestSaveResult = z.infer<typeof requestSaveResult>;

/* ------------------------------------------------------------------ *
 * Bakım
 * ------------------------------------------------------------------ */

export const maintenanceRecordRow = z.object({
  id: uuid,
  templateId: uuid.nullable(),
  /** Şablon kodu — ekran çeviriyi bu kodla arıyor, yoksa `label`'a düşüyor. */
  templateCode: z.string().nullable(),
  label: z.string(),
  equipmentType: z.string(),
  location: z.string().nullable(),
  intervalDays: z.number().int(),
  lastDoneAt: dateTime.nullable(),
  nextDueAt: dateTime,
  lastCostMinor: moneyMinor,
  isActive: z.boolean(),
  /** Vadeye kalan gün; negatifse gecikmiş. Sunucu saatinden türüyor. */
  daysUntilDue: z.number().int(),
});

/** Bakım geçmişinin bir satırı — her "yapıldı" olayı. */
export const maintenanceLogRow = z.object({
  id: uuid,
  recordId: uuid,
  /** Liste ekranı için: hangi bakım (şablon kodu varsa çeviriden okunur). */
  recordLabel: z.string(),
  templateCode: z.string().nullable(),
  doneAt: dateTime,
  costMinor: moneyMinor,
  documentUrl: z.string().nullable(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
});

export type MaintenanceLogRow = z.infer<typeof maintenanceLogRow>;

export const maintenanceTemplateRow = z.object({
  /** Tohum listeden geliyorsa `null` — henüz veritabanında karşılığı yok. */
  id: uuid.nullable(),
  code: z.string(),
  equipmentType: z.string(),
  name: z.string(),
  intervalDays: z.number().int(),
  regulatoryRef: z.string().nullable(),
  isMandatory: z.boolean(),
});

export const maintenanceListResponse = z.object({
  records: z.array(maintenanceRecordRow),
  /**
   * Site kendi şablonlarını tanımlamadıysa `packages/db` içindeki yasal
   * şablon listesi (asansör, yangın tüpü, jeneratör…) dönüyor: boş liste
   * göstermek, zorunlu bakımların varlığını kullanıcıdan gizlemek olurdu.
   * Hangisinin geldiği `templatesAreSeed` ile bildiriliyor.
   */
  templates: z.array(maintenanceTemplateRow),
  templatesAreSeed: z.boolean(),
  /** Son yapılan bakımlar (yeniden eskiye, en çok 20). */
  recentLogs: z.array(maintenanceLogRow),
  totals: z.object({
    tracked: z.number().int(),
    overdue: z.number().int(),
    soon: z.number().int(),
    mandatory: z.number().int(),
  }),
});

export type MaintenanceListResponse = z.infer<typeof maintenanceListResponse>;

/* ------------------------------------------------------------------ *
 * Bakım — yazma
 * ------------------------------------------------------------------ */

/**
 * `POST /v1/panel/operations/maintenance` (yeni),
 * `PATCH /v1/panel/operations/maintenance/:id` (güncelle).
 *
 * `lastDoneAt` ve `lastCostMinor` **burada yok**: "bakım yapıldı" bir kayıt
 * düzenlemesi değil, ayrı bir olay ve kendi ucu var (`:id/yapildi`). Aynı
 * forma koymak, plan bilgisini düzelten birinin son bakım tarihini de
 * farkında olmadan değiştirmesine yol açardı.
 *
 * `templateId` yalnız **bağ**: adı, periyodu ve ekipman türünü kayıt kendi
 * taşıyor. Şablon değişirse geçmiş kayıtların planı kaymasın diye kopyalanıyor
 * — şablon bir başlangıç noktası, bağlayıcı bir kaynak değil.
 */
export const maintenanceSave = z.object({
  templateId: uuid.nullish(),
  equipmentType: z.string().trim().min(2).max(80),
  label: z.string().trim().min(3).max(160),
  location: z.string().trim().max(120).nullish(),
  /** Periyot (gün). 4857/yönetmelik periyotları gün cinsinden tutuluyor. */
  intervalDays: z.coerce.number().int().min(1).max(3650),
  /** Sıradaki vade — ilk kayıtta elle, sonrakiler tamamlamadan türüyor. */
  nextDueAt: dateTime,
  isActive: z.coerce.boolean().default(true),
  notes: z.string().trim().max(2000).nullish(),
});

export type MaintenanceSave = z.infer<typeof maintenanceSave>;

/**
 * `POST /v1/panel/operations/maintenance/:id/complete` — bakım yapıldı.
 *
 * SIRADAKİ VADE **YAPILDIĞI TARİHTEN** İLERLİYOR, planlanan tarihten değil.
 * Planlanandan zincirlenseydi üç ay geciken bir bakım tamamlandığı anda
 * "yine gecikmiş" görünürdü; periyot "ne sıklıkla" sorusunun cevabı ve o
 * sıklık işin gerçekten yapıldığı andan ölçülür.
 */
export const maintenanceComplete = z.object({
  doneAt: dateTime,
  costMinor: z.coerce.number().int().min(0).default(0),
  /** Bakım raporu/servis formu bağlantısı. */
  documentUrl: z.string().trim().max(500).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

export type MaintenanceComplete = z.infer<typeof maintenanceComplete>;

export const maintenanceDetail = z.object({
  id: uuid,
  templateId: uuid.nullable(),
  equipmentType: z.string(),
  label: z.string(),
  location: z.string().nullable(),
  intervalDays: z.number().int(),
  lastDoneAt: dateTime.nullable(),
  nextDueAt: dateTime,
  lastCostMinor: moneyMinor,
  documentUrl: z.string().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  daysUntilDue: z.number().int(),
  /** Bu kaydın bakım geçmişi (yeniden eskiye). */
  history: z.array(maintenanceLogRow),
});

export type MaintenanceDetail = z.infer<typeof maintenanceDetail>;

export const maintenanceSaveResult = z.object({ id: uuid, label: z.string() });

export type MaintenanceSaveResult = z.infer<typeof maintenanceSaveResult>;

/* ------------------------------------------------------------------ *
 * Rezervasyon
 * ------------------------------------------------------------------ */

export const reservationResourceRow = z.object({
  id: uuid,
  name: z.string(),
  kind: z.string(),
  capacity: z.number().int().nullable(),
  feeMinor: moneyMinor,
  feeUnit: z.string(),
  depositMinor: moneyMinor,
  requiresApproval: z.boolean(),
  maxHoursPerBooking: z.number().int(),
  openHour: z.number().int(),
  closeHour: z.number().int(),
  isActive: z.boolean(),
});

export const reservationRow = z.object({
  id: uuid,
  resourceId: uuid,
  resourceName: z.string().nullable(),
  unitNumber: z.string().nullable(),
  startAt: dateTime,
  endAt: dateTime,
  guestCount: z.number().int(),
  status: z.string(),
  feeMinor: moneyMinor,
  /** Başkasının notu sakine gösterilmiyor (yalnız yönetim ve sahibi görür). */
  note: z.string().nullable(),
  /** Oturumdaki kullanıcının kendi rezervasyonu — sakin yalnız bunu iptal edebilir. */
  isMine: z.boolean(),
});

/**
 * `POST /v1/panel/operations/reservations/:id/cancel` — sahibi ya da yönetim.
 * Başlamış/geçmiş rezervasyon iptal edilmez; ücret borcu açıldıysa yönetim
 * iptali borcu ayrıca ele alır (sakine otomatik iade yok).
 */
export const reservationCancel = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type ReservationCancel = z.infer<typeof reservationCancel>;

export const reservationListResponse = z.object({
  resources: z.array(reservationResourceRow),
  rows: z.array(reservationRow),
  totals: z.object({
    pending: z.number().int(),
    upcoming: z.number().int(),
  }),
});

export type ReservationListResponse = z.infer<typeof reservationListResponse>;

/* ------------------------------------------------------------------ *
 * Rezervasyon — yazma
 * ------------------------------------------------------------------ */

/**
 * Tesis türleri — anahtarlar `packages/i18n` `enum.resourceKind` sözlüğüyle
 * **birebir** aynı. Yeni bir küme uydurmak, mevcut kayıtların ve çevirilerin
 * dışında kalan ikinci bir kelime dağarcığı üretirdi.
 */
export const RESOURCE_KINDS = [
  "salon",
  "misafir_odasi",
  "spor",
  "havuz",
  "otopark",
  "teras",
  "bahce",
  "diger",
] as const;
export const resourceKind = z.enum(RESOURCE_KINDS);

export const RESOURCE_FEE_UNITS = ["hour", "day", "booking"] as const;
export const resourceFeeUnit = z.enum(RESOURCE_FEE_UNITS);

/**
 * Tesis (rezerve edilebilir kaynak) tanımı.
 *
 * Modülün **girişi** burası: kaynak tanımlanmadan rezervasyon alınamaz ve
 * bugüne kadar tanımlama yolu hiç yoktu — ekran boş bir listeden ibaretti.
 */
export const resourceSave = z.object({
  name: z.string().trim().min(2).max(120),
  kind: resourceKind,
  capacity: z.coerce.number().int().min(0).max(10_000).nullish(),
  feeMinor: z.coerce.number().int().min(0).default(0),
  feeUnit: resourceFeeUnit.default("hour"),
  depositMinor: z.coerce.number().int().min(0).default(0),
  requiresApproval: z.coerce.boolean().default(true),
  maxHoursPerBooking: z.coerce.number().int().min(1).max(24).default(4),
  maxBookingsPerMonth: z.coerce.number().int().min(1).max(100).default(4),
  /** Açılış/kapanış saati (0–24). Rezervasyon bu aralığın dışına taşamaz. */
  openHour: z.coerce.number().int().min(0).max(23).default(8),
  closeHour: z.coerce.number().int().min(1).max(24).default(23),
  rulesText: z.string().trim().max(4000).nullish(),
  isActive: z.coerce.boolean().default(true),
})
  .refine((d) => d.closeHour > d.openHour, {
    message: "Kapanış saati açılıştan sonra olmalı.",
    path: ["closeHour"],
  });

export type ResourceSave = z.infer<typeof resourceSave>;

/**
 * Rezervasyon oluşturma.
 *
 * `feeMinor` **gönderilmiyor**: ücret kaynağın tarifesinden ve süreden
 * türüyor. İstemciden alınsaydı aynı salon iki sakine iki farklı fiyata
 * verilebilirdi — hem de kimse fark etmeden.
 *
 * `status` de gönderilmiyor: kaynak onay istiyorsa `pending`, istemiyorsa
 * doğrudan `approved`. Bu kaynağın kuralı, formu dolduranın tercihi değil.
 */
export const reservationCreate = z.object({
  resourceId: uuid,
  /** Kimin adına — rezervasyon bir kişiye ait, daireye değil. */
  userId: uuid,
  unitId: uuid.nullish(),
  startAt: dateTime,
  endAt: dateTime,
  guestCount: z.coerce.number().int().min(1).max(1000).default(1),
  note: z.string().trim().max(1000).nullish(),
});

export type ReservationCreate = z.infer<typeof reservationCreate>;

/**
 * Onay / ret / iptal.
 *
 * Üçü tek uçta çünkü üçü de aynı soruya cevap: "bu talep ne oldu". Ret ve
 * iptalde gerekçe isteniyor — sakine gösterilen tek açıklama o.
 */
export const RESERVATION_DECISIONS = [
  "approved",
  "rejected",
  "cancelled",
  "completed",
  "no_show",
] as const;
export const reservationDecision = z.enum(RESERVATION_DECISIONS);

export const reservationDecide = z.object({
  decision: reservationDecision,
  reason: z.string().trim().max(1000).nullish(),
});

export type ReservationDecide = z.infer<typeof reservationDecide>;

export const reservationSaveResult = z.object({
  id: uuid,
  status: z.string(),
  feeMinor: moneyMinor,
});

export type ReservationSaveResult = z.infer<typeof reservationSaveResult>;

export const resourceSaveResult = z.object({ id: uuid, name: z.string() });

export type ResourceSaveResult = z.infer<typeof resourceSaveResult>;

export const resourceDetail = z.object({
  id: uuid,
  name: z.string(),
  kind: z.string(),
  capacity: z.number().int().nullable(),
  feeMinor: moneyMinor,
  feeUnit: z.string(),
  depositMinor: moneyMinor,
  requiresApproval: z.boolean(),
  maxHoursPerBooking: z.number().int(),
  maxBookingsPerMonth: z.number().int(),
  openHour: z.number().int(),
  closeHour: z.number().int(),
  rulesText: z.string().nullable(),
  isActive: z.boolean(),
});

export type ResourceDetail = z.infer<typeof resourceDetail>;

/* ------------------------------------------------------------------ *
 * Sayaçlar
 * ------------------------------------------------------------------ */

export const meterRow = z.object({
  id: uuid,
  unitId: uuid.nullable(),
  unitNumber: z.string().nullable(),
  type: z.string(),
  serialNo: z.string().nullable(),
  isCommon: z.boolean(),
  unitPriceMinor: moneyMinor,
  isActive: z.boolean(),
});

export const meterReadingRow = z.object({
  id: uuid,
  meterId: uuid,
  meterType: z.string().nullable(),
  unitNumber: z.string().nullable(),
  period: z.string(),
  previousValue: z.string(),
  currentValue: z.string(),
  consumption: z.string(),
  amountMinor: moneyMinor,
  readingDate: dateTime,
  /**
   * Anomali işareti okuma **anında** hesaplanıp saklanıyor; geriye dönük
   * eşik değişikliği geçmiş okumaları yeniden yorumlamasın diye.
   */
  anomalyFlag: z.boolean(),
  /** Borçlandırıldıysa okuma kilitli: düzeltme/silme borç iptali gerektirir. */
  billed: z.boolean(),
});

export const meterListResponse = z.object({
  meters: z.array(meterRow),
  readings: z.array(meterReadingRow),
  totals: z.object({
    defined: z.number().int(),
    recentReadings: z.number().int(),
    anomalies: z.number().int(),
  }),
});

export type MeterListResponse = z.infer<typeof meterListResponse>;

/* ------------------------------------------------------------------ *
 * Sayaçlar — yazma
 * ------------------------------------------------------------------ */

export const METER_TYPES = [
  "water",
  "hot_water",
  "gas",
  "electric",
  "heat_calorimeter",
] as const;
export const meterType = z.enum(METER_TYPES);

/**
 * `POST /v1/panel/operations/meters` (yeni),
 * `PATCH /v1/panel/operations/meters/:id` (güncelle).
 *
 * `initialValue` SONRADAN DEĞİŞTİRİLEBİLİYOR ama yalnız **hiç okuma
 * girilmemişken**: ilk endeks tüketimin başlangıç noktası ve okuma girildikten
 * sonra değiştirmek geçmiş tüketimi geriye dönük değiştirirdi — faturası
 * çoktan kesilmiş bir tüketimi. Kısıtı sunucu uyguluyor.
 */
export const meterSave = z.object({
  /** Ortak alan sayacında boş. */
  unitId: uuid.nullish(),
  type: meterType,
  serialNo: z.string().trim().max(60).nullish(),
  isCommon: z.coerce.boolean().default(false),
  /** Birim fiyat (kuruş/m³ veya kuruş/kWh). */
  unitPriceMinor: z.coerce.number().int().min(0).default(0),
  /** Takılış endeksi. Yalnız hiç okuma yokken değiştirilebilir. */
  initialValue: z.coerce.number().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export type MeterSave = z.infer<typeof meterSave>;

/**
 * Dönemsel okuma girişi — **toplu**.
 *
 * NEDEN TOPLU: gerçek iş ayda bir kez binayı dolaşıp bütün sayaçları
 * okumaktır. Sayaç başına ayrı istek, 60 daireli bir binada 60 gidiş-dönüş
 * ve yarım kalmış bir tur demekti; tek istek, tek işlem, ya hepsi ya hiçbiri.
 *
 * `previousValue`, `consumption`, `amountMinor` ve `anomalyFlag`
 * **gönderilmiyor** — dördü de türetilmiş değer ve sunucuda hesaplanıyor.
 * İstemciden alınsalardı tüketim ile tutar arasındaki bağ koparılabilirdi.
 */
export const meterReadingBatch = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  readingDate: dateTime,
  entries: z
    .array(
      z.object({
        meterId: uuid,
        currentValue: z.coerce.number().min(0),
      }),
    )
    .min(1)
    .max(500),
  /**
   * Aynı dönemde okuma varsa üzerine yaz.
   *
   * Varsayılan **kapalı**: bir turu ikinci kez göndermek (tarayıcı yenileme,
   * çift tıklama) sessizce geçmişi değiştirmemeli. Düzeltme bilinçli bir
   * karar olmalı.
   */
  overwrite: z.coerce.boolean().default(false),
});

export type MeterReadingBatch = z.infer<typeof meterReadingBatch>;

export const meterReadingBatchResult = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  anomalies: z.number().int(),
  totalMinor: moneyMinor,
  /** Anomali işaretlenen satırlar — ekran bunları ayrıca gösteriyor. */
  flagged: z.array(
    z.object({
      meterId: uuid,
      unitNumber: z.string().nullable(),
      consumption: z.string(),
      reason: z.enum(["negative", "spike"]),
    }),
  ),
});

export type MeterReadingBatchResult = z.infer<typeof meterReadingBatchResult>;

export const meterDetail = z.object({
  id: uuid,
  unitId: uuid.nullable(),
  type: meterType,
  serialNo: z.string().nullable(),
  isCommon: z.boolean(),
  unitPriceMinor: moneyMinor,
  initialValue: z.string(),
  isActive: z.boolean(),
  /** Okuma girildiyse `initialValue` kilitli — ekran bunu söylüyor. */
  hasReadings: z.boolean(),
});

export type MeterDetail = z.infer<typeof meterDetail>;

/**
 * `PATCH /v1/panel/operations/meters/readings/:id` — tek okumayı düzelt.
 * Gerekçe zorunlu (denetim kütüğüne yazılır). Tüketim ve tutar sunucuda
 * yeniden hesaplanır; sonraki dönemin "önceki endeksi" de buna göre kayar.
 */
export const meterReadingCorrect = z.object({
  currentValue: z.coerce.number().min(0).max(999_999_999),
  reason: z.string().trim().min(10).max(500),
});
export type MeterReadingCorrect = z.infer<typeof meterReadingCorrect>;

/** `DELETE /v1/panel/operations/meters/readings/:id` — gerekçeli silme. */
export const meterReadingRemove = z.object({
  reason: z.string().trim().min(10).max(500),
});
export type MeterReadingRemove = z.infer<typeof meterReadingRemove>;

/**
 * `POST /v1/panel/operations/meters/readings/bill` — dönem tüketimini
 * borçlandır. Yalnız daireye bağlı, tutarı > 0 ve henüz borçlandırılmamış
 * okumalar; borç kiracıya, kiracı yoksa malike yazılır (tüketen öder).
 */
export const meterBill = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueDate: dateTime,
  /** Okuma bedeli: her borçlandırılan okumaya eklenen sabit tutar (kuruş). */
  readingFeeMinor: z.coerce.number().int().min(0).max(100_000_00).default(0),
  /** Borç tutarını tam liraya yuvarla (kuruşlar 50'den küçükse aşağı). */
  roundLira: z.coerce.boolean().default(false),
});
export type MeterBill = z.infer<typeof meterBill>;

/**
 * Okuma firması dosyası — firmanın hesapladığı sayaç başı tutarlar (Excel/CSV).
 * Sayaç seri no ile eşleşir; borç doğrudan yazılır (okuma geçmişine dokunmaz).
 */
export const meterVendorImport = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  fileBase64: z.string().min(4).max(6_000_000),
  dueDate: dateTime.optional(),
  description: z.string().trim().min(3).max(120).optional(),
  readingFeeMinor: z.coerce.number().int().min(0).max(100_000_00).default(0),
});
export type MeterVendorImport = z.infer<typeof meterVendorImport>;
export const meterVendorPreview = z.object({
  rows: z.array(
    z.object({
      line: z.number().int(),
      serialNo: z.string(),
      consumption: z.string().nullable(),
      amountMinor: moneyMinor,
      unitLabel: z.string().nullable(),
      status: z.enum(["ok", "unmatched", "no_unit", "already", "zero"]),
    }),
  ),
  totalMinor: moneyMinor,
  /** Başlık bulunamadıysa hangi sütunlar eksik. */
  missing: z.array(z.enum(["serial", "amount"])),
});
export type MeterVendorPreview = z.infer<typeof meterVendorPreview>;

export const meterBillResult = z.object({
  billed: z.number().int(),
  skipped: z.number().int(),
  totalMinor: moneyMinor,
});
export type MeterBillResult = z.infer<typeof meterBillResult>;

export const meterSaveResult = z.object({ id: uuid });

export type MeterSaveResult = z.infer<typeof meterSaveResult>;

/* ------------------------------------------------------------------ *
 * Kargo ve ziyaretçi defteri — `/v1/panel/frontdesk`
 * ------------------------------------------------------------------ */

export const parcelCreate = z.object({
  unitId: uuid.nullish(),
  recipientName: z.string().trim().min(2).max(160),
  carrier: z.string().trim().max(60).nullish(),
  trackingNo: z.string().trim().max(80).nullish(),
  note: z.string().trim().max(1000).nullish(),
});
export type ParcelCreate = z.infer<typeof parcelCreate>;

export const parcelDeliver = z.object({
  /** Teslim alan kişi (sakin ya da yakını). */
  deliveredTo: z.string().trim().min(2).max(160),
});
export type ParcelDeliver = z.infer<typeof parcelDeliver>;

export const parcelRow = z.object({
  id: uuid,
  unitId: uuid.nullable(),
  unitLabel: z.string().nullable(),
  recipientName: z.string(),
  carrier: z.string().nullable(),
  trackingNo: z.string().nullable(),
  note: z.string().nullable(),
  receivedAt: dateTime,
  deliveredAt: dateTime.nullable(),
  deliveredTo: z.string().nullable(),
});

export const visitorCreate = z.object({
  unitId: uuid.nullish(),
  visitorName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(20).nullish(),
  plate: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, " "))
    .nullish(),
  purpose: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(1000).nullish(),
});
export type VisitorCreate = z.infer<typeof visitorCreate>;

export const visitorRow = z.object({
  id: uuid,
  unitId: uuid.nullable(),
  unitLabel: z.string().nullable(),
  visitorName: z.string(),
  phone: z.string().nullable(),
  plate: z.string().nullable(),
  purpose: z.string().nullable(),
  note: z.string().nullable(),
  arrivedAt: dateTime,
  leftAt: dateTime.nullable(),
});

export const frontdeskResponse = z.object({
  parcels: z.array(parcelRow),
  visitors: z.array(visitorRow),
  totals: z.object({
    waitingParcels: z.number().int(),
    visitorsInside: z.number().int(),
    visitorsToday: z.number().int(),
  }),
});
export type FrontdeskResponse = z.infer<typeof frontdeskResponse>;
