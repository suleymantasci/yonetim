import { toQuery } from "./server";
import type { ListParams } from "../list-params";

/**
 * Tarayıcı URL'i ↔ API sözleşmesi çevirisi — tek yerde.
 *
 * Panel URL'i Türkçe parametre kullanmaya devam ediyor (`sayfa`, `adet`,
 * `sirala`, `yon`, `cop`): liste durumu URL'de tutulur, filtreli görünüm
 * paylaşılabilir kalır (GAP-DURUM kararı 6). HTTP yüzeyi ise kanonik İngilizce
 * adları kullanıyor — dış entegrasyonun Türkçe parametre öğrenmesi gerekmesin.
 *
 * İki adlandırmanın buluştuğu **tek** nokta burası; ekranlar ikisini de bilmez.
 */
export function toListQuery(
  params: ListParams,
  filters: Record<string, string | undefined> = {},
): string {
  return toQuery({
    page: params.page,
    perPage: params.pageSize,
    search: params.query || undefined,
    sort: params.sort,
    dir: params.direction,
    trashed: params.trashed ? "true" : undefined,
    ...filters,
  });
}
