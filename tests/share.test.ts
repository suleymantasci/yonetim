import { describe, expect, it } from "vitest";

import { landShareTotalLooksWrong, resolveLandShare, splitAmount } from "@yonetim/dues";

/**
 * Pay bölme ve arsa payı — GAP 4.1.3 / 4.2.3.
 *
 * Bu iki hesap sessizce yanlış çalışabilir: kuruş kaybı bilançoda görünmez,
 * arsa payı yuvarlaması ise aidatı yanlış dağıtır. Testler bu iki riski
 * doğrudan hedefliyor.
 */
describe("splitAmount", () => {
  it("eşit ağırlıklarda tutarı böler ve kuruş kaybetmez", () => {
    const parts = splitAmount(1000, [1, 1, 1]);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("artan kuruşu en büyük kesirli paya verir", () => {
    // 100 kuruş, ağırlık 1:2 → 33.33 / 66.67 → 33 + 67
    expect(splitAmount(100, [1, 2])).toEqual([33, 67]);
  });

  it("ağırlıklara göre orantılı böler", () => {
    const parts = splitAmount(120_000, [120, 880]);
    expect(parts).toEqual([14_400, 105_600]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(120_000);
  });

  it("12 taksitte kuruş kaybı olmaz", () => {
    const parts = splitAmount(100_001, Array.from({ length: 12 }, () => 1));
    expect(parts).toHaveLength(12);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_001);
    // Fark en fazla 1 kuruş olmalı: taksitler kabaca eşit kalmalı.
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });

  it("ağırlık toplamı sıfırsa hiç kimseye tutar yazmaz", () => {
    expect(splitAmount(500, [0, 0])).toEqual([0, 0]);
  });

  it("boş ağırlık listesinde boş sonuç döner", () => {
    expect(splitAmount(500, [])).toEqual([]);
  });

  it("tek alıcıda tutarın tamamını verir", () => {
    expect(splitAmount(12_345, [1])).toEqual([12_345]);
  });

  it("kalan dağıtımı deterministiktir (aynı girdi aynı çıktı)", () => {
    const a = splitAmount(1000, [1, 1, 1, 1, 1, 1, 1]);
    const b = splitAmount(1000, [1, 1, 1, 1, 1, 1, 1]);
    expect(a).toEqual(b);
  });
});

describe("resolveLandShare", () => {
  it("pay/payda verildiğinde ondalık değeri türetir", () => {
    expect(resolveLandShare({ numerator: 120, denominator: 1000 })).toEqual({
      landShare: "0.120000",
      numerator: 120,
      denominator: 1000,
    });
  });

  it("kesir verildiğinde ondalık girdiyi yok sayar (tapu otoritedir)", () => {
    const result = resolveLandShare({
      landShare: 0.5,
      numerator: 1,
      denominator: 4,
    });
    expect(result.landShare).toBe("0.250000");
  });

  it("yalnız ondalık verildiğinde kesir boş kalır", () => {
    expect(resolveLandShare({ landShare: 0.0125 })).toEqual({
      landShare: "0.012500",
      numerator: null,
      denominator: null,
    });
  });

  it("hiçbir değer yoksa null döner", () => {
    expect(resolveLandShare({})).toEqual({
      landShare: null,
      numerator: null,
      denominator: null,
    });
  });

  it("payda sıfırsa hata fırlatmaz, arsa payını boş bırakır", () => {
    expect(resolveLandShare({ numerator: 5, denominator: 0 })).toEqual({
      landShare: null,
      numerator: null,
      denominator: null,
    });
  });

  it("altı basamak hassasiyeti korur", () => {
    // 1/3 → 0.333333 (veritabanı numeric(10,6) ile uyumlu)
    expect(resolveLandShare({ numerator: 1, denominator: 3 }).landShare).toBe("0.333333");
  });
});

describe("landShareTotalLooksWrong", () => {
  it("oran ölçeğinde 1.0 toplamını doğru sayar", () => {
    expect(landShareTotalLooksWrong(1)).toBe(false);
    expect(landShareTotalLooksWrong(0.999)).toBe(false);
  });

  it("binde ölçeğinde 1000 toplamını doğru sayar", () => {
    expect(landShareTotalLooksWrong(1000)).toBe(false);
    expect(landShareTotalLooksWrong(999.5)).toBe(false);
  });

  it("iki ölçeğin de dışındaki toplamı hatalı sayar", () => {
    expect(landShareTotalLooksWrong(0.85)).toBe(true);
    expect(landShareTotalLooksWrong(1.4)).toBe(true);
    expect(landShareTotalLooksWrong(520)).toBe(true);
  });

  it("hiç arsa payı girilmemişse uyarı vermez", () => {
    expect(landShareTotalLooksWrong(0)).toBe(false);
  });
});
