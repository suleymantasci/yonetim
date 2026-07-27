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

export const requestListResponse = z.object({
  rows: z.array(requestRow),
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
  totals: z.object({
    tracked: z.number().int(),
    overdue: z.number().int(),
    soon: z.number().int(),
    mandatory: z.number().int(),
  }),
});

export type MaintenanceListResponse = z.infer<typeof maintenanceListResponse>;

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
  note: z.string().nullable(),
});

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
