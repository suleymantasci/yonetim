import { describe, expect, it } from "vitest";

import {
  STAMP_DUTY_RATE,
  calculateSeverance,
  noticeWeeksFor,
  type SeveranceInput,
} from "@yonetim/core";

/**
 * Kıdem ve ihbar tazminatı — 1475 s.K. md.14, 4857 s.K. md.17.
 *
 * Testler kanunun **sabit** kısımlarını kilitliyor (gün sayıları, ihbar
 * kademeleri, hangi kalemin hangi vergiye tabi olduğu). Yılda bir değişen
 * tavan ve vergi oranı parametre olduğu için burada sabit değerlerle
 * veriliyor — testin yıl başında kırılması istenmiyor, kırılması gereken şey
 * `packages/config` içindeki tarih damgası.
 */

const MONTHLY_GROSS = 6_000_000; // 60.000 ₺
const CEILING = 5_300_000; // 53.000 ₺

function input(overrides: Partial<SeveranceInput> = {}): SeveranceInput {
  return {
    startedAt: new Date("2020-01-01T00:00:00Z"),
    endedAt: new Date("2026-01-01T00:00:00Z"),
    monthlyGrossMinor: MONTHLY_GROSS,
    ceilingMinor: CEILING,
    incomeTaxRate: 0.15,
    noticeApplies: true,
    severanceApplies: true,
    ...overrides,
  };
}

describe("ihbar süreleri (4857 md.17)", () => {
  it("altı aydan az çalışanda iki hafta", () => {
    expect(noticeWeeksFor(0)).toBe(2);
    expect(noticeWeeksFor(5.9)).toBe(2);
  });

  it("altı ayı **dolduran** dört haftaya geçer — sınır dahil", () => {
    // Kanun "altı aydan bir buçuk yıla kadar" diyor; 6 ayı dolduran üst
    // kademededir. Sınırı yanlış tarafa koymak en olası hata.
    expect(noticeWeeksFor(6)).toBe(4);
    expect(noticeWeeksFor(17.9)).toBe(4);
  });

  it("bir buçuk yıl ve üzeri altı, üç yıl ve üzeri sekiz hafta", () => {
    expect(noticeWeeksFor(18)).toBe(6);
    expect(noticeWeeksFor(35.9)).toBe(6);
    expect(noticeWeeksFor(36)).toBe(8);
    expect(noticeWeeksFor(240)).toBe(8);
  });
});

describe("kıdem tazminatı", () => {
  it("bir yılı doldurmayan işçiye kıdem ödenmez ve bu ayrıca bildirilir", () => {
    const result = calculateSeverance(
      input({ endedAt: new Date("2020-11-01T00:00:00Z") }),
    );
    expect(result.belowMinimumService).toBe(true);
    expect(result.severance.grossMinor).toBe(0);
    // İhbar ayrı bir hak: kıdem doğmasa da ödenir.
    expect(result.notice.grossMinor).toBeGreaterThan(0);
  });

  it("her tam yıl için 30 günlük ücret verir", () => {
    const result = calculateSeverance(
      input({
        startedAt: new Date("2025-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:00:00Z"),
        monthlyGrossMinor: 1_000_000,
        ceilingMinor: 100_000_000,
      }),
    );
    // Tam bir yıl (365 gün) → tam bir aylık brüt.
    expect(result.severance.grossMinor).toBe(1_000_000);
  });

  it("kesirli yıl gün üzerinden orantılanır", () => {
    const result = calculateSeverance(
      input({
        startedAt: new Date("2024-01-01T00:00:00Z"),
        // 365 + 182 gün ≈ 1,4986 yıl
        endedAt: new Date("2025-07-01T00:00:00Z"),
        monthlyGrossMinor: 1_000_000,
        ceilingMinor: 100_000_000,
      }),
    );
    expect(result.severance.grossMinor).toBeGreaterThan(1_400_000);
    expect(result.severance.grossMinor).toBeLessThan(1_600_000);
  });

  /**
   * En kritik test: tavan **yıllık** tutara uygulanır, toplama değil.
   * Toplama uygulansaydı 20 yıllık işçinin tazminatı bir yıllık tavana
   * kırpılır, gerçek tutarın yirmide birine düşerdi.
   */
  it("tavanı yıllık tutara uygular, toplam tutara değil", () => {
    const twentyYears = calculateSeverance(
      input({
        startedAt: new Date("2006-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    // Ücret tavanın üstünde; taban tavana kırpılmış olmalı.
    expect(twentyYears.cappedMonthlyGrossMinor).toBe(CEILING);
    expect(twentyYears.ceilingExcessMinor).toBe(MONTHLY_GROSS - CEILING);

    // Yaklaşık 20 × tavan; tek bir tavana kırpılmamış.
    expect(twentyYears.severance.grossMinor).toBeGreaterThan(CEILING * 19);
    expect(twentyYears.severance.grossMinor).toBeLessThan(CEILING * 21);
  });

  it("tavanın altındaki ücret kırpılmaz", () => {
    const result = calculateSeverance(
      input({ monthlyGrossMinor: 2_000_000 }),
    );
    expect(result.cappedMonthlyGrossMinor).toBe(2_000_000);
    expect(result.ceilingExcessMinor).toBe(0);
  });

  it("gelir vergisinden istisnadır, yalnız damga vergisi kesilir", () => {
    const result = calculateSeverance(input());
    expect(result.severance.incomeTaxMinor).toBe(0);
    expect(result.severance.stampDutyMinor).toBe(
      Math.round(result.severance.grossMinor * STAMP_DUTY_RATE),
    );
    expect(result.severance.netMinor).toBe(
      result.severance.grossMinor - result.severance.stampDutyMinor,
    );
  });
});

describe("ihbar tazminatı", () => {
  it("hafta sayısı × 7 günlük ücret olarak hesaplanır", () => {
    const result = calculateSeverance(
      input({
        startedAt: new Date("2016-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:00:00Z"),
        monthlyGrossMinor: 3_000_000, // günlük 100.000 kuruş
        ceilingMinor: 100_000_000,
      }),
    );
    expect(result.noticeWeeks).toBe(8);
    expect(result.notice.grossMinor).toBe(100_000 * 8 * 7);
  });

  it("hem gelir hem damga vergisine tabidir", () => {
    const result = calculateSeverance(input({ incomeTaxRate: 0.2 }));
    expect(result.notice.incomeTaxMinor).toBe(
      Math.round(result.notice.grossMinor * 0.2),
    );
    expect(result.notice.stampDutyMinor).toBeGreaterThan(0);
    expect(result.notice.netMinor).toBe(
      result.notice.grossMinor -
        result.notice.incomeTaxMinor -
        result.notice.stampDutyMinor,
    );
  });

  it("kıdem tavanına tabi değildir — tavan yalnız kıdeme uygulanır", () => {
    const result = calculateSeverance(input());
    // Günlük ücret tavandan değil **gerçek** brütten türüyor.
    const dailyGross = MONTHLY_GROSS / 30;
    expect(result.notice.grossMinor).toBe(Math.round(dailyGross * 8 * 7));
  });

  it("doğmadığı hâllerde sıfırlanır ve hafta sayısı da sıfır gösterilir", () => {
    const result = calculateSeverance(input({ noticeApplies: false }));
    expect(result.notice.grossMinor).toBe(0);
    expect(result.noticeWeeks).toBe(0);
    // Kıdem etkilenmez.
    expect(result.severance.grossMinor).toBeGreaterThan(0);
  });
});

describe("kenar durumlar", () => {
  it("çıkış tarihi girişten önceyse negatif tazminat üretmez", () => {
    const result = calculateSeverance(
      input({
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2025-01-01T00:00:00Z"),
      }),
    );
    expect(result.serviceDays).toBe(0);
    expect(result.severance.grossMinor).toBe(0);
    expect(result.totalNetMinor).toBeGreaterThanOrEqual(0);
  });

  it("iki hak da doğmuyorsa toplam sıfırdır", () => {
    const result = calculateSeverance(
      input({ noticeApplies: false, severanceApplies: false }),
    );
    expect(result.totalNetMinor).toBe(0);
  });

  it("sonuç her zaman **tahmin** olarak işaretlenir", () => {
    // Gelir vergisi tek marjinal oranla hesaplanıyor; sonucu bordro gibi
    // sunmak işten çıkarma görüşmesinde taahhüt olarak okunurdu.
    expect(calculateSeverance(input()).isEstimate).toBe(true);
  });

  it("tutarlar tam sayı kuruştur — float sızmaz", () => {
    const result = calculateSeverance(
      input({ monthlyGrossMinor: 4_137_913, incomeTaxRate: 0.15 }),
    );
    for (const value of [
      result.severance.grossMinor,
      result.severance.stampDutyMinor,
      result.severance.netMinor,
      result.notice.grossMinor,
      result.notice.incomeTaxMinor,
      result.notice.netMinor,
      result.totalNetMinor,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
