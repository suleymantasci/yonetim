/**
 * Liste sayfası URL parametreleri — GAP 4.3.1 (arama, filtre, sıralama, sayfalama).
 *
 * KARAR: liste durumu **URL'de** tutulur, istemci state'inde değil.
 * Gerekçe: (1) filtreli görünüm paylaşılabilir ve yer imlenebilir,
 * (2) sunucu tarafında sayfalama yapılabilir — 200 daireyi tarayıcıya
 * göndermek gerekmez, (3) geri tuşu beklendiği gibi çalışır,
 * (4) Server Component önbelleği anahtar olarak URL'i kullanır.
 */

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export interface ListParams {
  query: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  /** Modüle özel filtreler (blockId, status, categoryId …). */
  filters: Record<string, string>;
  /** Çöp kutusu görünümü (soft-delete edilmiş kayıtlar). */
  trashed: boolean;
}

export type SearchParamsInput = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * `searchParams` nesnesini doğrulanmış liste parametrelerine çevirir.
 *
 * Bilinmeyen sıralama anahtarı sessizce varsayılana düşer: URL'den gelen değer
 * doğrudan SQL'e girmediği için (whitelist ile eşlenir) enjeksiyon riski yok,
 * ama hata sayfası göstermek de gereksiz — kullanıcı elle URL kurcalamış olabilir.
 */
export function parseListParams(
  searchParams: SearchParamsInput,
  options: {
    sortableKeys: readonly string[];
    defaultSort: string;
    defaultDirection?: "asc" | "desc";
    filterKeys?: readonly string[];
  },
): ListParams {
  const rawPage = Number.parseInt(single(searchParams.sayfa), 10);
  const rawSize = Number.parseInt(single(searchParams.adet), 10);
  const sort = single(searchParams.sirala);
  const direction = single(searchParams.yon);

  const filters: Record<string, string> = {};
  for (const key of options.filterKeys ?? []) {
    const value = single(searchParams[key]);
    if (value) filters[key] = value;
  }

  return {
    query: single(searchParams.q).trim().slice(0, 100),
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE,
    sort: options.sortableKeys.includes(sort) ? sort : options.defaultSort,
    direction: direction === "desc" ? "desc" : (options.defaultDirection ?? "asc"),
    filters,
    trashed: single(searchParams.cop) === "1",
  };
}

/**
 * Mevcut parametreleri koruyarak yeni bir querystring üretir.
 * Sıralama başlıkları ve sayfalama bağlantıları bunu kullanır; bir filtreyi
 * değiştirmek diğerlerini sıfırlamaz.
 */
export function buildListHref(
  basePath: string,
  params: ListParams,
  patch: Partial<Record<"q" | "sayfa" | "adet" | "sirala" | "yon" | "cop", string | number>> &
    Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();

  const merged: Record<string, string> = {
    q: params.query,
    sayfa: String(params.page),
    adet: String(params.pageSize),
    sirala: params.sort,
    yon: params.direction,
    ...(params.trashed ? { cop: "1" } : {}),
    ...params.filters,
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") delete merged[key];
    else merged[key] = String(value);
  }

  // Varsayılan değerleri URL'e yazmayız: adres kısa ve okunur kalsın.
  if (merged.sayfa === "1") delete merged.sayfa;
  if (merged.adet === String(DEFAULT_PAGE_SIZE)) delete merged.adet;
  if (merged.q === "") delete merged.q;

  for (const [key, value] of Object.entries(merged)) {
    if (value !== "") search.set(key, value);
  }

  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Sayfalama özet metni için 1 tabanlı aralık. */
export function pageRange(params: ListParams, total: number) {
  const from = total === 0 ? 0 : (params.page - 1) * params.pageSize + 1;
  const to = Math.min(total, params.page * params.pageSize);
  return { from, to, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) };
}
