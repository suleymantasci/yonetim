import { z } from "zod";

import {
  changeReason,
  dateTime,
  moneyMinor,
  periodKey,
  uuid,
} from "../_shared/fields";
import { listQuery, option, pageMeta } from "../_shared/list";

/**
 * Borç sözleşmesi — MIMARI-PLAN §6.4 `debt`.
 *
 * İki kural burada protokol seviyesinde yaşıyor:
 *  - **gerekçesiz düzeltme yok** (GAP-DURUM kararı 9): tutar/vade değişikliği
 *    `X-Change-Reason` başlığı olmadan reddedilir;
 *  - **yıkıcı işlemde önizleme zorunlu** (karar 8): toplu borçlandırma
 *    `confirmed: false` ile yazmaz.
 */

export const DEBT_SORT_KEYS = [
  "dueDate",
  "amount",
  "unit",
  "period",
  "status",
  "createdAt",
] as const;
export const debtSort = z.enum(DEBT_SORT_KEYS);

export const DEBT_KINDS = [
  "dues",
  "extra",
  "penalty",
  "damage",
  "utility",
  "opening_balance",
] as const;
export const debtKind = z.enum(DEBT_KINDS);

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
    notes: z.string().nullable(),
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
  /** Append-only değişiklik tarihçesi — GAP 5.2 şeffaflık. */
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
 * Yazma
 * ------------------------------------------------------------------ */

export const debtCreate = z.object({
  unitId: uuid,
  debtorUserId: uuid.nullish(),
  kind: debtKind.default("extra"),
  description: z.string().trim().min(1).max(200),
  period: z.string().max(7).nullish(),
  amountMinor: z.coerce.number().int().positive(),
  dueDate: dateTime,
  lateFeeExempt: z.coerce.boolean().default(false),
  /** 1 ise tek borç; >1 ise taksitlendirilir ve tutar `distribute()` ile bölünür. */
  installmentCount: z.coerce.number().int().min(1).max(36).default(1),
  notes: z.string().trim().max(1000).nullish(),
});

export type DebtCreate = z.infer<typeof debtCreate>;

/** Toplu borçlandırma — önizleme zorunlu (karar 8). */
export const debtBulkCreate = z.object({
  period: periodKey,
  kind: debtKind.default("extra"),
  description: z.string().trim().min(1).max(200),
  amountMinor: z.coerce.number().int().positive(),
  dueDate: dateTime,
  /** Boş ise tüm bloklar. */
  blockIds: z.array(uuid).default([]),
  /** Aidat muafı birimler hariç tutulsun mu? */
  skipExempt: z.coerce.boolean().default(true),
  /** `equal` eşit · `area` m² · `landShare` arsa payı oranında. */
  distribution: z.enum(["equal", "area", "landShare"]).default("equal"),
  confirmed: z.coerce.boolean().default(false),
});

export type DebtBulkCreate = z.infer<typeof debtBulkCreate>;

export const debtBulkPreview = z.object({
  rows: z.array(
    z.object({
      unitId: uuid,
      unitNumber: z.string(),
      blockName: z.string().nullable(),
      amountMinor: moneyMinor,
      skipped: z.boolean(),
      skipReason: z.string().nullable(),
    }),
  ),
  totalMinor: moneyMinor,
  unitCount: z.number().int(),
  skippedCount: z.number().int(),
  /** Zaten bu dönem+açıklama ile borcu olan birimler. */
  duplicateCount: z.number().int(),
});

export type DebtBulkPreview = z.infer<typeof debtBulkPreview>;

export const debtBulkResult = z.object({
  created: z.number().int(),
  totalMinor: moneyMinor,
  skipped: z.number().int(),
});

/**
 * Borç düzeltme — GAP-DURUM kararı 9.
 *
 * Gerekçe **gövdede de** taşınıyor (başlıkta da olacak): `audit_debt_changes`
 * tablosu sakine gösterilebilen bir metin saklıyor ve o metin denetim
 * kütüğündekiyle aynı olmalı. İki ayrı alan olsaydı ayrışabilirlerdi.
 */
export const debtAdjust = z.object({
  amountMinor: z.coerce.number().int().min(0).optional(),
  dueDate: dateTime.optional(),
  lateFeeMinor: z.coerce.number().int().min(0).optional(),
  reason: changeReason,
  /** Sakin bu düzeltmeyi portalinde görsün mü? */
  visibleToResident: z.coerce.boolean().default(true),
});

export type DebtAdjust = z.infer<typeof debtAdjust>;

/** Tahsilat — mahsup sırası sunucuda belirlenir (en eski borç önce). */
export const paymentCollect = z.object({
  unitId: uuid,
  payerUserId: uuid.nullish(),
  amountMinor: z.coerce.number().int().positive(),
  method: z.enum([
    "cash",
    "bank_transfer",
    "credit_card",
    "auto_payment",
    "other",
  ]),
  paidAt: dateTime,
  receiptNo: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(500).nullish(),
  /** Boş ise sunucu en eski vadeye göre mahsup eder. */
  debtIds: z.array(uuid).default([]),
});

export type PaymentCollect = z.infer<typeof paymentCollect>;

export const paymentCollectResult = z.object({
  paymentId: uuid,
  allocatedMinor: moneyMinor,
  remainingMinor: moneyMinor,
  closedDebtCount: z.number().int(),
});

/** Toplu iptal / muafiyet — gerekçe başlıkta. */
export const debtIds = z.object({ ids: z.array(uuid).min(1) });
export const debtExemptPatch = z.object({
  ids: z.array(uuid).min(1),
  lateFeeExempt: z.coerce.boolean(),
});

/** Açık borçlar (tahsilat formu için). */
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

/** Son borç değişiklikleri — denetim ve dashboard şeffaflık göstergesi. */
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
