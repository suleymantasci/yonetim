import { z } from "zod";

import { changeReason, isoDate, moneyMinor, uuid } from "../_shared/fields";
import { listQuery, option, pageMeta } from "../_shared/list";

/**
 * Birim (bağımsız bölüm) sözleşmesi — MIMARI-PLAN §7 / §8.5.
 *
 * Bu dosya A1 dikey diliminin sözleşmesidir; diğer 40+ modül aynı şablonu
 * kopyalar: `*ListQuery` → `*ListResponse` (satır + facet + toplam **tek**
 * yanıtta), `*Create` / `*Update` giriş şemaları, `*Detail` sekme verisi.
 */

export const UNIT_TYPES = [
  "flat",
  "shop",
  "office",
  "depot",
  "garage",
  "villa",
  "common_area",
] as const;
export const OWNERSHIP_TYPES = ["owner", "tenant", "vacant"] as const;

export const unitType = z.enum(UNIT_TYPES);
export const ownershipType = z.enum(OWNERSHIP_TYPES);

/** Sıralanabilir alanlar — URL'den gelen değer asla doğrudan SQL'e girmez. */
export const UNIT_SORT_KEYS = [
  "number",
  "floor",
  "area",
  "landShare",
  "type",
  "createdAt",
] as const;
export const unitSort = z.enum(UNIT_SORT_KEYS);

/* ------------------------------------------------------------------ *
 * Liste
 * ------------------------------------------------------------------ */

export const unitListQuery = listQuery.extend({
  sort: unitSort.default("number"),
  blockId: uuid.optional(),
  type: unitType.optional(),
  /** `muaf` aidat muafı · `bos` boş daire · `borclu` açık borcu olan. */
  status: z.enum(["all", "muaf", "bos", "borclu"]).default("all"),
});

export type UnitListQuery = z.infer<typeof unitListQuery>;

export const unitRow = z.object({
  id: uuid,
  number: z.string(),
  floor: z.number().int(),
  type: unitType,
  areaM2: z.string().nullable(),
  landShare: z.string().nullable(),
  landShareNumerator: z.number().int().nullable(),
  landShareDenominator: z.number().int().nullable(),
  ownershipType,
  duesExempt: z.boolean(),
  lateFeeExempt: z.boolean(),
  duesMultiplier: z.string(),
  blockId: uuid.nullable(),
  blockName: z.string().nullable(),
  deletedAt: z.coerce.date().nullable(),
  /** Ödenmemiş bakiye, kuruş (gecikme tazminatı dahil). */
  outstandingMinor: moneyMinor,
  occupantCount: z.number().int(),
});

export type UnitRow = z.infer<typeof unitRow>;

/**
 * Ekran odaklı yanıt (§9a): liste + facet + toplam + filtre açılırı **tek**
 * çağrıda. Bugün `birimler/page.tsx` bunun için 5 ayrı sorgu yapıyor.
 */
export const unitListResponse = z.object({
  rows: z.array(unitRow),
  meta: pageMeta,
  facets: z.object({
    /** Filtre açılırı için blok listesi (+ birim sayısı). */
    blocks: z.array(option),
    trashedCount: z.number().int(),
  }),
  totals: z.object({
    /** Filtreden bağımsız: arsa payı uyarısı tüm siteyi kapsamalı. */
    unitTotal: z.number().int(),
    landShareTotal: z.number(),
    areaTotal: z.number(),
  }),
});

export type UnitListResponse = z.infer<typeof unitListResponse>;

/* ------------------------------------------------------------------ *
 * Detay
 * ------------------------------------------------------------------ */

export const unitOccupant = z.object({
  occupancyId: uuid,
  userId: uuid,
  relation: ownershipType,
  ownershipPct: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable(),
  debtTransferPolicy: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  /** Maskeli — ham numara panel listesine hiç inmez (KVKK md.4 ölçülülük). */
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  whatsappOptIn: z.boolean(),
});

export const unitDetail = z.object({
  unit: unitRow.extend({
    roomCount: z.string().nullable(),
    residentCount: z.number().int(),
    currentOwnerId: uuid.nullable(),
    currentTenantId: uuid.nullable(),
    notes: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  }),
  block: z.object({ id: uuid, name: z.string() }).nullable(),
  occupants: z.array(unitOccupant),
  debtSummary: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    paidThisYearMinor: moneyMinor,
    openCount: z.number().int(),
  }),
  recentDebts: z.array(
    z.object({
      id: uuid,
      description: z.string(),
      kind: z.string(),
      period: z.string().nullable(),
      amountMinor: moneyMinor,
      paidMinor: moneyMinor,
      lateFeeMinor: moneyMinor,
      dueDate: z.coerce.date(),
      status: z.string(),
    }),
  ),
  recentPayments: z.array(
    z.object({
      id: uuid,
      amountMinor: moneyMinor,
      method: z.string(),
      status: z.string(),
      paidAt: z.coerce.date().nullable(),
      receiptNo: z.string().nullable(),
    }),
  ),
  meters: z.array(
    z.object({
      id: uuid,
      type: z.string(),
      serialNo: z.string().nullable(),
      lastReading: z.string().nullable(),
      lastReadAt: z.coerce.date().nullable(),
    }),
  ),
  documents: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      category: z.string(),
      createdAt: z.coerce.date(),
    }),
  ),
});

export type UnitDetail = z.infer<typeof unitDetail>;

/* ------------------------------------------------------------------ *
 * Yazma
 * ------------------------------------------------------------------ */

export const unitCreate = z.object({
  blockId: uuid.nullish(),
  number: z.string().trim().min(1).max(20),
  floor: z.coerce.number().int().min(-10).max(200),
  type: unitType.default("flat"),
  areaM2: z.coerce.number().min(1).max(100_000).nullish(),
  /**
   * Arsa payı: ondalık oran **kanonik**, pay/payda girdi ve gösterim için.
   * İkisi birlikte gelirse tutarlılığı sunucu kurar (`resolveLandShare`).
   */
  landShare: z.coerce.number().min(0).max(1000).nullish(),
  landShareNumerator: z.coerce.number().int().min(1).nullish(),
  landShareDenominator: z.coerce.number().int().min(1).nullish(),
  roomCount: z.string().trim().max(10).nullish(),
  residentCount: z.coerce.number().int().min(0).max(50).default(0),
  ownershipType: ownershipType.default("owner"),
  duesExempt: z.coerce.boolean().default(false),
  lateFeeExempt: z.coerce.boolean().default(false),
  duesMultiplier: z.coerce.number().min(0).max(10).default(1),
  notes: z.string().trim().max(2000).nullish(),
});

export type UnitCreate = z.infer<typeof unitCreate>;

export const unitUpdate = unitCreate.partial();
export type UnitUpdate = z.infer<typeof unitUpdate>;

/**
 * Toplu birim üretimi — GAP 4.1.1 ("tüm A blok otomatik").
 *
 * `preview: true` ile çağrıldığında hiçbir şey yazılmaz, yalnız üretilecek
 * numaralar ve çakışmalar döner. Yazma isteği `preview: false` ise API
 * `preview_required` döndürür — GAP-DURUM kararı 8 protokol seviyesinde.
 */
export const unitBulkCreate = z.object({
  blockId: uuid.nullish(),
  /** `blockId` boşsa bu isimle yeni blok açılır. */
  newBlockName: z.string().trim().max(60).nullish(),
  floorFrom: z.coerce.number().int().min(-5).max(200),
  floorTo: z.coerce.number().int().min(-5).max(200),
  perFloor: z.coerce.number().int().min(1).max(40),
  /** `{blok}`, `{kat}`, `{no}` yer tutucuları desteklenir. */
  pattern: z.string().trim().min(1).max(40),
  numbering: z.enum(["sequential", "floorPrefixed"]),
  type: unitType.default("flat"),
  areaM2: z.coerce.number().min(1).max(100_000).nullish(),
  landShareDenominator: z.coerce.number().int().min(1).nullish(),
  /** Önizleme onayı; `false` iken yazma reddedilir (`preview_required`). */
  confirmed: z.coerce.boolean().default(false),
});

export type UnitBulkCreate = z.infer<typeof unitBulkCreate>;

export const unitBulkPreview = z.object({
  /** Üretilecek numaralar — ekranda birebir gösterilen küme. */
  numbers: z.array(z.string()),
  /** Zaten var olduğu için atlanacaklar. Hata değil: sihirbaz tekrar koşabilir. */
  skipped: z.array(z.string()),
  total: z.number().int(),
  blockName: z.string(),
});

export type UnitBulkPreview = z.infer<typeof unitBulkPreview>;

export const unitBulkCreateResult = z.object({
  created: z.number().int(),
  skipped: z.array(z.string()),
});

export type UnitBulkCreateResult = z.infer<typeof unitBulkCreateResult>;

/**
 * Toplu alan güncellemesi — "tüm birimlere %10 zam".
 * Zam `duesMultiplier` üzerinden **oransal**; tutar doğrudan yazılmaz.
 */
export const unitBulkPatch = z.object({
  ids: z.array(uuid).min(1),
  multiplierFactor: z.coerce.number().min(0.1).max(10).optional(),
  duesExempt: z.coerce.boolean().optional(),
  lateFeeExempt: z.coerce.boolean().optional(),
  blockId: uuid.nullable().optional(),
});

export type UnitBulkPatch = z.infer<typeof unitBulkPatch>;

/** Soft-delete / geri alma — GAP-DURUM kararı 12: kalıcı silme arayüzde yok. */
export const unitIds = z.object({
  ids: z.array(uuid).min(1),
});

export const bulkResult = z.object({
  affected: z.number().int(),
  requested: z.number().int(),
});

export type BulkResult = z.infer<typeof bulkResult>;

/** Gerekçe gövdede değil `X-Change-Reason` başlığında taşınır (§8.5). */
export type UnitChangeReason = z.infer<typeof changeReason>;

/* ------------------------------------------------------------------ *
 * Blok
 * ------------------------------------------------------------------ */

export const blockRow = z.object({
  id: uuid,
  name: z.string(),
  floorCount: z.number().int(),
  unitCount: z.number().int(),
  hasElevator: z.boolean(),
  sortOrder: z.number().int(),
});

export type BlockRow = z.infer<typeof blockRow>;

export const blockCreate = z.object({
  name: z.string().trim().min(1).max(60),
  floorCount: z.coerce.number().int().min(1).max(200).default(1),
  hasElevator: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export type BlockCreate = z.infer<typeof blockCreate>;
export const blockUpdate = blockCreate.partial();
export type BlockUpdate = z.infer<typeof blockUpdate>;

export const blockListResponse = z.object({
  rows: z.array(blockRow),
});

export type BlockListResponse = z.infer<typeof blockListResponse>;

/** Combobox: borç/gider ekranlarının birim seçicisi. */
export const unitOptionRow = z.object({
  id: uuid,
  number: z.string(),
  blockName: z.string().nullable(),
  floor: z.number().int(),
});

export type UnitOptionRow = z.infer<typeof unitOptionRow>;

/** Dış `/v1/units` yüzeyi — donuk sözleşme (§9.1). Alan kümesi sabit. */
export const publicUnit = z.object({
  id: uuid,
  number: z.string(),
  blockName: z.string().nullable(),
  floor: z.number().int(),
  type: unitType,
  areaM2: z.string().nullable(),
  landShare: z.string().nullable(),
  ownershipType,
  duesExempt: z.boolean(),
  outstandingKurus: moneyMinor,
  createdAt: isoDate.or(z.coerce.date()),
});

export type PublicUnit = z.infer<typeof publicUnit>;
