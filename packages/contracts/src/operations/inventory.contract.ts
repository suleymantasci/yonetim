import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Demirbaş / envanter defteri — KMK md.34/9, rakip incelemesi §4.1.
 *
 * Yönetici ortak yer eşyasını korumak ve **devir teslimde hesabını vermekle**
 * yükümlü. Modülün varlık sebebi bu: liste bir envanter dökümü değil, devir
 * teslim belgesinin kaynağı.
 */

export const INVENTORY_STATUSES = [
  "active",
  "in_repair",
  "broken",
  "disposed",
  "lost",
] as const;
export const inventoryStatus = z.enum(INVENTORY_STATUSES);

/**
 * Kategoriler `varchar` olarak saklanıyor, `pgEnum` değil.
 *
 * Durum (`status`) kapalı bir küme ve sorgu anlamı taşıyor — o enum. Kategori
 * ise siteye göre büyüyecek bir sınıflandırma; her yeni kategori için
 * migration yazmak bu modülü kullanılmaz kılardı.
 */
export const INVENTORY_CATEGORIES = [
  "furniture", // mobilya
  "electronics", // elektronik
  "tools", // alet/ekipman
  "safety", // yangın ve güvenlik ekipmanı
  "garden", // bahçe
  "cleaning", // temizlik
  "playground", // oyun grubu / spor
  "other",
] as const;
export const inventoryCategory = z.enum(INVENTORY_CATEGORIES);

export const inventoryRow = z.object({
  id: uuid,
  code: z.string().nullable(),
  name: z.string(),
  category: z.string(),
  location: z.string().nullable(),
  quantity: z.number().int(),
  serialNo: z.string().nullable(),
  purchaseDate: dateTime.nullable(),
  purchasePriceKurus: moneyMinor,
  warrantyUntil: dateTime.nullable(),
  status: z.string(),
  responsibleStaffId: uuid.nullable(),
  responsibleStaffName: z.string().nullable(),
  notes: z.string().nullable(),
  /**
   * Garanti süresi doldu mu — **sunucu saatine göre**. İstemcide
   * hesaplansaydı saati şaşmış bir tarayıcı "garantisi var" derdi; bu ölçü
   * tam da yanlış olmasının pahalı olduğu yerde.
   */
  warrantyExpired: z.boolean(),
});

export type InventoryRow = z.infer<typeof inventoryRow>;

export const inventoryListResponse = z.object({
  rows: z.array(inventoryRow),
  /** Zimmet atamak için aktif personel — ekranın ikinci çağrıya ihtiyacı olmasın (§9a). */
  staffOptions: z.array(z.object({ id: uuid, name: z.string() })),
  totals: z.object({
    items: z.number().int(),
    /** Adet toplamı; satır sayısıyla aynı değil (5 adet sandalye = 1 satır). */
    units: z.number().int(),
    /** Yalnız `active` + `in_repair` kalemlerin alış bedeli toplamı. */
    valueMinor: moneyMinor,
    needsAttention: z.number().int(),
    /**
     * Kayıp kalem sayısı ayrı sayılıyor: devir teslimde sorulan tek soru bu
     * ve `needsAttention` içinde eriyip gitmemeli.
     */
    lost: z.number().int(),
  }),
});

export type InventoryListResponse = z.infer<typeof inventoryListResponse>;

/**
 * Kayıt/güncelleme — `id` varsa günceller.
 *
 * Kayıt **silinmiyor**, `status` ile düşülüyor (`disposed`/`lost`): demirbaş
 * defteri bir tarihçe, anlık liste değil. "Geçen yıl bu jeneratör vardı, ne
 * oldu" sorusu silinmiş bir satırdan cevaplanamaz.
 */
export const inventorySave = z.object({
  id: uuid.optional(),
  code: z.string().trim().max(40).nullish(),
  name: z.string().trim().min(2).max(160),
  category: inventoryCategory,
  location: z.string().trim().max(120).nullish(),
  quantity: z.coerce.number().int().min(1).max(100_000),
  serialNo: z.string().trim().max(80).nullish(),
  purchaseDate: dateTime.nullish(),
  purchasePriceMinor: z.coerce.number().int().min(0).default(0),
  warrantyUntil: dateTime.nullish(),
  status: inventoryStatus.default("active"),
  responsibleStaffId: uuid.nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export type InventorySave = z.infer<typeof inventorySave>;

export const inventorySaveResult = z.object({ id: uuid });

/** Toplu durum değişikliği — sayım sonrası "şunlar kayıp" işaretlemesi. */
export const inventoryStatusPatch = z.object({
  ids: z.array(uuid).min(1),
  status: inventoryStatus,
});

export const inventoryPatchResult = z.object({
  affected: z.number().int(),
});

export type InventoryPatchResult = z.infer<typeof inventoryPatchResult>;
