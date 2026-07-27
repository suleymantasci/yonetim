import { z } from "zod";

/**
 * `/api/v1` sayfalama sözleşmesi — Next'teki `lib/api.ts`'ten birebir.
 *
 * `pageSize` üst sınırı 200: dış entegrasyonun tüm tabloyu tek istekte
 * çekmesini engeller (bellek ve süre koruması).
 *
 * Parametre adları **İngilizce** (`page`, `pageSize`, `sort`, `direction`).
 * Panel yüzeyindeki Türkçe adlar (`sayfa`, `adet`, …) tarayıcı URL'i için;
 * burası yayınlanmış bir sözleşme ve adları değiştirilemez.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});

export type PublicV1Pagination = z.output<typeof paginationSchema>;

/**
 * Sorgu dizesini doğrulanmış sayfalama nesnesine çevirir.
 *
 * Boş string'ler `undefined`'a indirgeniyor: `?q=&sort=` gönderen bir istemci,
 * hiç göndermemişle aynı sonucu almalı — aksi hâlde boş bir arama terimi
 * `ilike '%%'` üretip filtreyi sessizce anlamsızlaştırırdı.
 */
export function parsePagination(query: Record<string, unknown>): PublicV1Pagination {
  const pick = (key: string): string | undefined => {
    const value = query[key];
    if (typeof value !== "string" || value === "") return undefined;
    return value;
  };

  return paginationSchema.parse({
    page: pick("page"),
    pageSize: pick("pageSize"),
    q: pick("q"),
    sort: pick("sort"),
    direction: pick("direction"),
  });
}

export interface PublicV1ListMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/**
 * Liste zarfı — `{ data, meta }`.
 *
 * `pageCount` en az 1: sonuç boşken 0 dönmek, "sayfa 1 / 0" gibi tuhaf bir
 * gösterime yol açıyordu.
 */
export function toListEnvelope<T>(
  items: T[],
  meta: { page: number; pageSize: number; total: number },
): { data: T[]; meta: PublicV1ListMeta } {
  return {
    data: items,
    meta: {
      ...meta,
      pageCount: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
    },
  };
}
