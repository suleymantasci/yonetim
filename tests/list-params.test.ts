import { describe, expect, it } from "vitest";

import {
  buildListHref, DEFAULT_PAGE_SIZE, pageRange, parseListParams,
} from "../apps/app/src/lib/list-params";

/**
 * Liste parametreleri — GAP 4.3.1.
 *
 * Bu katman URL'den gelen ham veriyi sorgu parametrelerine çeviriyor; kötü
 * niyetli veya bozuk girdinin sessizce SQL'e geçmemesi kritik. Testler iki
 * şeyi garanti ediyor: (1) bilinmeyen sıralama anahtarı beyaz listeye düşer,
 * (2) bağlantı üretimi mevcut filtreleri kaybetmez.
 */
const OPTIONS = {
  sortableKeys: ["number", "floor", "area"] as const,
  defaultSort: "number",
  filterKeys: ["blok", "tip", "durum"] as const,
};

describe("parseListParams", () => {
  it("boş parametrelerde makul varsayılanlar verir", () => {
    const params = parseListParams({}, OPTIONS);
    expect(params).toMatchObject({
      query: "",
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: "number",
      direction: "asc",
      trashed: false,
    });
    expect(params.filters).toEqual({});
  });

  it("bilinmeyen sıralama anahtarını varsayılana düşürür", () => {
    // SQL'e enjeksiyon denemesi de dahil: beyaz liste dışı her değer düşer.
    const params = parseListParams({ sirala: "number; DROP TABLE units" }, OPTIONS);
    expect(params.sort).toBe("number");
  });

  it("izinli sıralama anahtarını kabul eder", () => {
    expect(parseListParams({ sirala: "area", yon: "desc" }, OPTIONS)).toMatchObject({
      sort: "area",
      direction: "desc",
    });
  });

  it("geçersiz sayfa numarasını 1'e çeker", () => {
    expect(parseListParams({ sayfa: "-3" }, OPTIONS).page).toBe(1);
    expect(parseListParams({ sayfa: "abc" }, OPTIONS).page).toBe(1);
    expect(parseListParams({ sayfa: "0" }, OPTIONS).page).toBe(1);
  });

  it("izin verilmeyen sayfa boyutunu varsayılana çeker", () => {
    // 1000 satır istemek sunucuyu zorlamanın en kolay yolu; beyaz liste engelliyor.
    expect(parseListParams({ adet: "1000" }, OPTIONS).pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(parseListParams({ adet: "50" }, OPTIONS).pageSize).toBe(50);
  });

  it("aramayı 100 karakterle sınırlar ve kırpar", () => {
    const long = "a".repeat(250);
    const params = parseListParams({ q: `   ${long}   ` }, OPTIONS);
    expect(params.query).toHaveLength(100);
  });

  it("yalnız tanımlı filtre anahtarlarını alır", () => {
    const params = parseListParams(
      { blok: "b1", tip: "flat", bilinmeyen: "x" },
      OPTIONS,
    );
    expect(params.filters).toEqual({ blok: "b1", tip: "flat" });
  });

  it("dizi olarak gelen parametrede ilk değeri kullanır", () => {
    expect(parseListParams({ q: ["ilk", "ikinci"] }, OPTIONS).query).toBe("ilk");
  });

  it("çöp kutusu görünümünü yalnız cop=1 ile açar", () => {
    expect(parseListParams({ cop: "1" }, OPTIONS).trashed).toBe(true);
    expect(parseListParams({ cop: "0" }, OPTIONS).trashed).toBe(false);
    expect(parseListParams({ cop: "true" }, OPTIONS).trashed).toBe(false);
  });
});

describe("buildListHref", () => {
  it("varsayılan değerleri adrese yazmaz", () => {
    const params = parseListParams({}, OPTIONS);
    // sirala/yon varsayılan da olsa açıkça yazılır (sıralama okunur kalsın),
    // ama sayfa=1 ve varsayılan adet yazılmaz.
    const href = buildListHref("/panel/birimler", params, {});
    expect(href).not.toContain("sayfa=1");
    expect(href).not.toContain(`adet=${DEFAULT_PAGE_SIZE}`);
  });

  it("mevcut filtreleri korur", () => {
    const params = parseListParams({ blok: "b1", durum: "borclu", q: "A-1" }, OPTIONS);
    const href = buildListHref("/panel/birimler", params, { sayfa: 2 });
    expect(href).toContain("blok=b1");
    expect(href).toContain("durum=borclu");
    expect(href).toContain("q=A-1");
    expect(href).toContain("sayfa=2");
  });

  it("boş değer verilen parametreyi adresten siler", () => {
    const params = parseListParams({ cop: "1", blok: "b1" }, OPTIONS);
    const href = buildListHref("/panel/birimler", params, { cop: "" });
    expect(href).not.toContain("cop=");
    expect(href).toContain("blok=b1");
  });

  it("sıralama değişikliğinde sayfayı başa alabilir", () => {
    const params = parseListParams({ sayfa: "5" }, OPTIONS);
    const href = buildListHref("/panel/birimler", params, {
      sirala: "area",
      yon: "desc",
      sayfa: 1,
    });
    expect(href).toContain("sirala=area");
    expect(href).toContain("yon=desc");
    expect(href).not.toContain("sayfa=");
  });

  it("hiç parametre kalmazsa temiz yol döner", () => {
    const params = parseListParams({}, { ...OPTIONS, defaultSort: "" });
    const href = buildListHref("/panel/birimler", params, { sirala: "", yon: "" });
    expect(href).toBe("/panel/birimler");
  });
});

describe("pageRange", () => {
  it("1 tabanlı aralık ve sayfa sayısı verir", () => {
    const params = parseListParams({ sayfa: "2", adet: "25" }, OPTIONS);
    expect(pageRange(params, 60)).toEqual({ from: 26, to: 50, pageCount: 3 });
  });

  it("son sayfada üst sınırı toplamla kırpar", () => {
    const params = parseListParams({ sayfa: "3", adet: "25" }, OPTIONS);
    expect(pageRange(params, 60)).toEqual({ from: 51, to: 60, pageCount: 3 });
  });

  it("kayıt yoksa aralık sıfırdır ama sayfa sayısı 1 kalır", () => {
    const params = parseListParams({}, OPTIONS);
    expect(pageRange(params, 0)).toEqual({ from: 0, to: 0, pageCount: 1 });
  });
});
