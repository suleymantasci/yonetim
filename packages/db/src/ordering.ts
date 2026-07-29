import { asc, desc, sql, type SQL } from "drizzle-orm";

import { blocks, units } from "./schema/index";

/**
 * Bağımsız bölüm sıralaması — SQL'de tek doğru yer.
 *
 * `units.number` bir **metin** kolonu ve öyle olmak zorunda: "12/B", "5A",
 * "Zemin 1" gerçek daire numaraları. Ama metin sırasında `"10" < "2"` olduğu
 * için listeler `1, 10, 11, … 19, 2, 20` diye gidiyordu — 24 daireli bir
 * sitede bile okunamaz hale gelen bir sıra.
 *
 * Çözüm numarayı tipine göre değil **içindeki ilk sayıya** göre sıralamak:
 * `"A-12"` → 12, `"5A"` → 5. Hiç rakam içermeyenler (`"Zemin"`) `NULL` olup
 * PostgreSQL'in ASC varsayılanıyla sona düşüyor; oraya konmaları da doğru,
 * numarasız bölüm listenin başında değil sonunda aranır.
 *
 * `::numeric` kullanılıyor, `::bigint` değil: uzun bir numara (barkod benzeri
 * girilmiş bir değer) bigint'i taşırıp **sorguyu 500'e düşürürdü**. Sıralama
 * bir kolaylık; veriye takılıp listeyi hiç açmamak kabul edilebilir değil.
 */
export const unitNumberNatural = sql`NULLIF(substring(${units.number} from '[0-9]+'), '')::numeric`;

/**
 * Blok → daire doğal sırası: "A Blok 1, 2, … 10", sonra "B Blok 1, 2 …".
 *
 * Bloklar `sort_order` ile yönetimin verdiği düzende; o eşitse ada göre.
 * Bloksuz bölümler (tek binalı site) `sort_order` NULL olduğu için sona
 * düşer — karışık kurulumda blokluların arasına serpilmelerinden iyidir.
 *
 * Sonda ham `number` var: "5A" ve "5B" aynı doğal anahtara sahip, aralarındaki
 * sıra ancak metinle belirlenebilir.
 */
export function unitOrder(dir: SortDir = "asc"): SQL[] {
  const d = dir === "desc" ? desc : asc;
  return [d(blocks.sortOrder), d(blocks.name), d(unitNumberNatural), d(units.number)];
}

/**
 * Blok bilgisi olmayan (yalnız `units` tablosuna bakan) sorgular için.
 * `blocks` join'i yoksa blok sütunlarına sıralamada da başvurulamaz.
 */
export function unitNumberOrder(dir: SortDir = "asc"): SQL[] {
  const d = dir === "desc" ? desc : asc;
  return [d(unitNumberNatural), d(units.number)];
}

type SortDir = "asc" | "desc";
