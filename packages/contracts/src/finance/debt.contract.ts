import { z } from "zod";

import { changeReason, dateTime, moneyMinor, uuid } from "../_shared/fields";
import { listQuery, option, pageMeta } from "../_shared/list";

/**
 * Borç sözleşmesi — MIMARI-PLAN §6.4 `debt`.
 *
 * İki ürün kuralı burada **protokol seviyesinde** yaşıyor:
 *  - gerekçesiz düzeltme yok (GAP-DURUM kararı 9): `reason` en az 10 karakter,
 *    ve `X-Change-Reason` başlığı da aynı metni taşıyor;
 *  - yıkıcı işlemde önizleme zorunlu (karar 8): toplu borçlandırma
 *    `confirmed: false` ile yazmaz.
 *
 * Para her yerde **kuruş** (`moneyMinor`) — float yok.
 */

export const DEBT_KINDS = [
  "dues",
  "utility",
  "reservation",
  "penalty",
  "late_fee",
  "extra",
  "legal_cost",
] as const;
export const debtKind = z.enum(DEBT_KINDS);

/**
 * Borcun kime yazılacağı — GAP 4.1.3 "borç paylaşımı seçimi".
 *
 * `split` (yarı yarıya) ve `share` (hisseye göre) tek bir `debtorUserId`
 * alanına sığmaz; bunlar **birden fazla borç kaydı** üretir. Tek kayıt üretip
 * "yarısı şunun" demek cari hesapları ve tahsilat mahsubunu bozardı.
 */
export const SHARE_TARGETS = ["owner", "tenant", "split", "share"] as const;
export const shareTarget = z.enum(SHARE_TARGETS);

export const DUES_FORMULAS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "custom",
] as const;
export const duesFormula = z.enum(DUES_FORMULAS);

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "credit_balance",
  "offset",
] as const;
export const paymentMethod = z.enum(PAYMENT_METHODS);

export const DEBT_SORT_KEYS = [
  "dueDate",
  "amount",
  "unit",
  "period",
  "status",
  "createdAt",
] as const;
export const debtSort = z.enum(DEBT_SORT_KEYS);

/* ------------------------------------------------------------------ *
 * Liste
 * ------------------------------------------------------------------ */

export const debtListQuery = listQuery.extend({
  sort: debtSort.default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  blockId: uuid.optional(),
  period: z.string().max(7).optional(),
  kind: debtKind.optional(),
  status: z
    .enum(["all", "acik", "gecikmis", "odendi", "taksit"])
    .default("all"),
});

export type DebtListQuery = z.infer<typeof debtListQuery>;

export const debtRow = z.object({
  id: uuid,
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  debtorUserId: uuid.nullable(),
  debtorName: z.string().nullable(),
  kind: z.string(),
  description: z.string(),
  period: z.string().nullable(),
  amountMinor: moneyMinor,
  paidMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  dueDate: dateTime,
  status: z.string(),
  lateFeeExempt: z.boolean(),
  installmentNo: z.number().int().nullable(),
  installmentCount: z.number().int().nullable(),
  /** Bu borcun değişiklik kaydı var mı — listede şeffaflık işareti (SPEC 3.2). */
  changeCount: z.number().int(),
});

export type DebtRow = z.infer<typeof debtRow>;

export const debtListResponse = z.object({
  rows: z.array(debtRow),
  meta: pageMeta,
  facets: z.object({
    blocks: z.array(option),
    periods: z.array(z.string()),
  }),
  /** Özet toplamlar filtreden bağımsız: yönetici genel durumu görsün. */
  totals: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    lateFeeMinor: moneyMinor,
    collectedMinor: moneyMinor,
  }),
});

export type DebtListResponse = z.infer<typeof debtListResponse>;

/* ------------------------------------------------------------------ *
 * Detay
 * ------------------------------------------------------------------ */

export const debtChangeEntry = z.object({
  id: uuid,
  changeType: z.string(),
  oldAmountMinor: moneyMinor.nullable(),
  newAmountMinor: moneyMinor.nullable(),
  oldDueDate: dateTime.nullable(),
  newDueDate: dateTime.nullable(),
  changedByName: z.string().nullable(),
  reason: z.string().nullable(),
  visibleToResident: z.boolean(),
  createdAt: dateTime,
});

export const debtDetail = z.object({
  debt: z.object({
    id: uuid,
    unitId: uuid,
    debtorUserId: uuid.nullable(),
    duesPlanId: uuid.nullable(),
    kind: z.string(),
    description: z.string(),
    period: z.string().nullable(),
    amountMinor: moneyMinor,
    paidMinor: moneyMinor,
    lateFeeMinor: moneyMinor,
    dueDate: dateTime,
    status: z.string(),
    lateFeeExempt: z.boolean(),
    installmentNo: z.number().int().nullable(),
    installmentCount: z.number().int().nullable(),
    metadata: z.record(z.unknown()).default({}),
    createdAt: dateTime,
    deletedAt: dateTime.nullable(),
  }),
  unit: z.object({
    id: uuid,
    number: z.string(),
    blockName: z.string().nullable(),
  }),
  debtorName: z.string().nullable(),
  planName: z.string().nullable(),
  /** Append-only değişiklik tarihçesi — SPEC 3.2 şeffaflık. */
  changes: z.array(debtChangeEntry),
  allocations: z.array(
    z.object({
      paymentId: uuid,
      amountMinor: moneyMinor,
      paidAt: dateTime.nullable(),
      method: z.string(),
      receiptNo: z.string().nullable(),
      payerName: z.string().nullable(),
    }),
  ),
  /** Aynı taksit planındaki kardeş borçlar. */
  siblings: z.array(
    z.object({
      id: uuid,
      installmentNo: z.number().int().nullable(),
      amountMinor: moneyMinor,
      paidMinor: moneyMinor,
      dueDate: dateTime,
      status: z.string(),
    }),
  ),
});

export type DebtDetail = z.infer<typeof debtDetail>;

/* ------------------------------------------------------------------ *
 * Yazma — tek borç
 * ------------------------------------------------------------------ */

export const debtCreate = z.object({
  unitId: uuid,
  kind: debtKind,
  description: z.string().trim().min(3).max(200),
  amountMinor: z.coerce.number().int().positive(),
  dueDate: dateTime,
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  shareTarget,
  lateFeeExempt: z.coerce.boolean().default(false),
  /** 1 = tek seferlik; >1 taksitlendirir ve vadeler ay ay ileri kayar. */
  installmentCount: z.coerce.number().int().min(1).max(36).default(1),
  notes: z.string().trim().max(1000).optional(),
});

export type DebtCreate = z.infer<typeof debtCreate>;

export const debtCreateResult = z.object({
  ids: z.array(uuid),
  unitNumber: z.string(),
});

export type DebtCreateResult = z.infer<typeof debtCreateResult>;

/* ------------------------------------------------------------------ *
 * Yazma — toplu borçlandırma
 * ------------------------------------------------------------------ */

export const debtBulkCreate = z.object({
  description: z.string().trim().min(3).max(200),
  kind: debtKind,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueDay: z.coerce.number().int().min(1).max(28),
  formula: duesFormula,
  /** `equal`: birim başı tutar; diğerleri: dağıtılacak havuz. */
  amountMinor: z.coerce.number().int().positive(),
  shareTarget,
  /** Boş = tüm bloklar. */
  blockIds: z.array(uuid).default([]),
  unitTypes: z.array(z.string()).default([]),
  skipExisting: z.coerce.boolean().default(true),
  lateFeeExempt: z.coerce.boolean().default(false),
});

export type DebtBulkCreate = z.infer<typeof debtBulkCreate>;

export const debtBulkPreviewRow = z.object({
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  amountMinor: moneyMinor,
  exempt: z.boolean(),
  alreadyExists: z.boolean(),
});

export const debtBulkPreview = z.object({
  rows: z.array(debtBulkPreviewRow),
  /** Atlanacaklar düşülmüş net toplam. */
  totalMinor: moneyMinor,
});

export type DebtBulkPreview = z.infer<typeof debtBulkPreview>;

export const debtBulkResult = z.object({
  createdCount: z.number().int(),
  skippedCount: z.number().int(),
  totalMinor: moneyMinor,
});

export type DebtBulkResult = z.infer<typeof debtBulkResult>;

/* ------------------------------------------------------------------ *
 * Yazma — düzeltme, tahsilat, toplu işlem
 * ------------------------------------------------------------------ */

/**
 * Borç tutarı/vadesi düzeltme — GAP-DURUM kararı 9.
 *
 * Gerekçe **gövdede** taşınıyor (başlıkta da gidiyor): `audit_debt_changes`
 * sakine gösterilebilen bir metin saklıyor ve o metin denetim kütüğündekiyle
 * aynı olmalı. İki ayrı alan olsaydı ayrışabilirlerdi.
 */
export const debtAdjust = z.object({
  amountMinor: z.coerce.number().int().min(0),
  dueDate: dateTime,
  reason: changeReason,
  visibleToResident: z.coerce.boolean().default(true),
  lateFeeExempt: z.coerce.boolean().default(false),
});

export type DebtAdjust = z.infer<typeof debtAdjust>;

export const paymentCollect = z.object({
  unitId: uuid,
  amountMinor: z.coerce.number().int().positive(),
  method: paymentMethod,
  paidAt: dateTime,
  payerUserId: uuid.optional(),
  receiptNo: z.string().trim().max(30).optional(),
  /** Belirli borçlara öncelik; boşsa en eski vade önce. */
  debtIds: z.array(uuid).default([]),
  note: z.string().trim().max(500).optional(),
});

export type PaymentCollect = z.infer<typeof paymentCollect>;

export const paymentCollectResult = z.object({
  paymentId: uuid,
  allocatedMinor: moneyMinor,
  /** Borcu aşan kısım — sessizce yutulmaz, yöneticiye bildirilir. */
  creditBalanceMinor: moneyMinor,
  closedDebtCount: z.number().int(),
});

export type PaymentCollectResult = z.infer<typeof paymentCollectResult>;

/** Borç iptali — gerekçe zorunlu, ödenmiş borç iptal edilemez. */
export const debtCancel = z.object({
  ids: z.array(uuid).min(1),
  reason: changeReason,
});

export const debtExemptPatch = z.object({
  ids: z.array(uuid).min(1),
  exempt: z.coerce.boolean(),
});

export const debtBulkResultSimple = z.object({
  affected: z.number().int(),
  requested: z.number().int(),
});

export type DebtBulkResultSimple = z.infer<typeof debtBulkResultSimple>;

/** Bir birimin açık borçları — tahsilat formu için. */
export const openDebtRow = z.object({
  id: uuid,
  description: z.string(),
  period: z.string().nullable(),
  amountMinor: moneyMinor,
  paidMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  dueDate: dateTime,
});

export const openDebtList = z.object({ rows: z.array(openDebtRow) });
export type OpenDebtList = z.infer<typeof openDebtList>;

/** Son borç değişiklikleri — denetim ekranı ve dashboard şeffaflık göstergesi. */
export const debtChangeFeedRow = z.object({
  id: uuid,
  debtId: uuid,
  unitId: uuid.nullable(),
  unitNumber: z.string().nullable(),
  changeType: z.string(),
  oldAmountMinor: moneyMinor.nullable(),
  newAmountMinor: moneyMinor.nullable(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: dateTime,
});

export const debtChangeFeed = z.object({ rows: z.array(debtChangeFeedRow) });
export type DebtChangeFeed = z.infer<typeof debtChangeFeed>;

/**
 * Daire özeti görünümü — borçlar ekranının ikinci sekmesi (satır = daire).
 * Liste ve özet ayrı sayfa olsaydı yönetici hangisinde olduğunu takip etmek
 * zorunda kalırdı; sekme yeterli.
 */
export const unitDebtSummaryRow = z.object({
  unitId: uuid,
  number: z.string(),
  blockName: z.string().nullable(),
  outstandingMinor: moneyMinor,
  overdueMinor: moneyMinor,
  oldestDue: dateTime.nullable(),
  debtCount: z.number().int(),
});

export const unitDebtSummary = z.object({ rows: z.array(unitDebtSummaryRow) });
export type UnitDebtSummary = z.infer<typeof unitDebtSummary>;
