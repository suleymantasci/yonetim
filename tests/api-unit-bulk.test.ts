import { describe, expect, it } from "vitest";

import { buildNumbers } from "../apps/api/src/property/unit/unit-bulk.service";
import type { UnitBulkCreate } from "../packages/contracts/src/property/unit.contract";

/**
 * Toplu üretim numaralandırması — GAP 4.1.1 + GAP-DURUM kararı 8.
 *
 * Bu fonksiyonu **hem önizleme hem yazma** çağırıyor. Kararın anlamlı olması
 * bu tekliğe bağlı: iki taraf ayrı hesap yapsaydı önizleme bir şey gösterip
 * başka bir şey yazılabilirdi. Testler o yüzden fonksiyonun kendisine bakıyor.
 */
const base: UnitBulkCreate = {
  blockId: null,
  newBlockName: "A",
  floorFrom: 1,
  floorTo: 3,
  perFloor: 2,
  pattern: "{blok}-{no}",
  numbering: "floorPrefixed",
  type: "flat",
  areaM2: null,
  landShareDenominator: null,
  confirmed: false,
};

describe("toplu birim numaralandırma", () => {
  it("kat önekli numaralandırma kat×daire matrisi üretir", () => {
    const plan = buildNumbers(base, "A", new Set());
    expect(plan.numbers).toEqual(["A-101", "A-102", "A-201", "A-202", "A-301", "A-302"]);
    expect(plan.skipped).toEqual([]);
  });

  it("ardışık numaralandırma kattan bağımsız sayar", () => {
    const plan = buildNumbers({ ...base, numbering: "sequential" }, "A", new Set());
    expect(plan.numbers).toEqual(["A-1", "A-2", "A-3", "A-4", "A-5", "A-6"]);
  });

  it("{kat} yer tutucusu kat numarasını basar", () => {
    const plan = buildNumbers(
      { ...base, pattern: "{blok}/{kat}/{no}", floorTo: 1, perFloor: 2 },
      "A",
      new Set(),
    );
    expect(plan.numbers).toEqual(["A/1/101", "A/1/102"]);
  });

  it("var olan numaraları atlar, hata vermez", () => {
    // Sihirbaz ikinci kez koşturulduğunda eksik kalanları tamamlayabilmeli.
    const plan = buildNumbers(base, "A", new Set(["A-101", "A-202"]));
    expect(plan.numbers).toEqual(["A-102", "A-201", "A-301", "A-302"]);
    expect(plan.skipped).toEqual(["A-101", "A-202"]);
  });

  it("aynı kalıptan doğan kendi içindeki tekrarı da atlar", () => {
    // `{blok}` sabit, `{no}` kullanılmıyorsa her satır aynı numarayı üretirdi;
    // ilki yazılır, gerisi çakışma olarak raporlanır.
    const plan = buildNumbers({ ...base, pattern: "{blok}" }, "A", new Set());
    expect(plan.numbers).toEqual(["A"]);
    expect(plan.skipped).toHaveLength(5);
  });

  it("numarayı 20 karaktere kırpar (sütun sınırı)", () => {
    const plan = buildNumbers(
      { ...base, pattern: "{blok}-{no}", floorTo: 1, perFloor: 1 },
      "COK-UZUN-BLOK-ADI-BURADA",
      new Set(),
    );
    expect(plan.numbers[0]).toHaveLength(20);
  });

  it("floor aralığı ters ise boş plan üretir", () => {
    // Servis bunu ayrıca 400 ile reddediyor; fonksiyon yine de çökmemeli.
    const plan = buildNumbers({ ...base, floorFrom: 5, floorTo: 1 }, "A", new Set());
    expect(plan.numbers).toEqual([]);
  });

  it("her numara kendi katıyla eşleşir", () => {
    const plan = buildNumbers(base, "A", new Set());
    expect(plan.entries.map((e) => e.floor)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});
