import { z } from "zod";

/**
 * Liste sorgu/yanıt iskeleti — MIMARI-PLAN §9a "bir ekran = bir çağrı".
 *
 * Tarayıcı URL'i Türkçe parametre kullanmaya devam eder (`sayfa`, `adet`,
 * `sirala`, `yon`, `cop` — GAP-DURUM kararı 6, liste durumu URL'de). Bu
 * sözleşme **HTTP yüzeyinin** kanonik adlandırmasıdır; `apps/app` çeviriyi
 * `toListQuery()` ile tek yerde yapar. Dış entegrasyonun Türkçe parametre
 * öğrenmesi gerekmiyor, panel de paylaşılabilir URL'ini kaybetmiyor.
 */

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
/** Dış entegrasyonun tüm tabloyu tek istekte çekmesini engeller. */
export const MAX_PAGE_SIZE = 200;

export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(100).default(""),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  /** Çöp kutusu görünümü (soft-delete edilmiş kayıtlar). */
  trashed: z.coerce.boolean().default(false),
});

export type ListQuery = z.infer<typeof listQuery>;

export const pageMeta = z.object({
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
  pageCount: z.number().int(),
});

export type PageMeta = z.infer<typeof pageMeta>;

/** `paginated(rowSchema)` → `{ rows, meta }`. */
export function paginated<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    rows: z.array(row),
    meta: pageMeta,
  });
}

export function toPageMeta(
  page: number,
  perPage: number,
  total: number,
): PageMeta {
  return {
    page,
    perPage,
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Bir seçim listesi (combobox, filtre açılırı) — birçok ekran aynı şekli
 * kullandığı için tek yerde tanımlı.
 */
export const option = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number().int().optional(),
});

export type Option = z.infer<typeof option>;
