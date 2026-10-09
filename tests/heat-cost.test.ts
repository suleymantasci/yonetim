import { describe, expect, it } from "vitest";

import { computeHeatShares, type HeatInput } from "../apps/api/src/operations/heat-cost";

const base: HeatInput = {
  mode: "heat", invoiceMinor: 1_000_000, commonPct: 30, minConsumptionPct: null, readingFeeMinor: 0, rounding: "none",
  units: [
    { unitId: "a", areaM2: 100, heatConsumption: 600, waterConsumption: 0 },
    { unitId: "b", areaM2: 100, heatConsumption: 400, waterConsumption: 0 },
  ],
};

describe("ısı pay ölçer paylaşımı", () => {
  it("%30 m², %70 tüketim", () => {
    const r = computeHeatShares(base);
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => [x.commonMinor, x.consumptionMinor, x.totalMinor])).toEqual([
      [150_000, 420_000, 570_000],
      [150_000, 280_000, 430_000],
    ]);
  });

  it("asgari tüketim: ortalamanın altındaki daire emsalden sayılır", () => {
    const r = computeHeatShares({
      ...base,
      minConsumptionPct: 40,
      units: [...base.units, { unitId: "c", areaM2: 100, heatConsumption: 0, waterConsumption: 0 }],
    });
    // ortalama 1000/300 m² = 3,333/m²; %40 → 1,333/m² → c: 133,334
    const c = r.rows.find((x) => x.unitId === "c")!;
    expect(c.minApplied).toBe(true);
    expect(c.adjustedConsumption).toBeCloseTo(133.334, 3);
    expect(c.consumptionMinor).toBeGreaterThan(0);
    // toplam faturayı (yukarı yuvarlama payıyla) karşılar
    const sum = r.rows.reduce((s, x) => s + x.totalMinor, 0);
    expect(sum).toBeGreaterThanOrEqual(1_000_000);
    expect(sum - 1_000_000).toBeLessThanOrEqual(r.rows.length * 2);
  });

  it("okuma bedeli ve yuvarlama", () => {
    const r = computeHeatShares({ ...base, invoiceMinor: 1_000_001, readingFeeMinor: 750, rounding: "lira" });
    expect(r.rows.every((x) => x.totalMinor % 100 === 0)).toBe(true);
    expect(r.rows[0]!.readingFeeMinor).toBe(750);
    const t = computeHeatShares({ ...base, invoiceMinor: 1_000_001, rounding: "ten_kurus" });
    expect(t.rows.every((x) => x.totalMinor % 10 === 0)).toBe(true);
  });

  it("yakıt + su: su ısıtma faturadan ayrılır, su sayacına göre", () => {
    const r = computeHeatShares({
      ...base,
      mode: "heat_water",
      water: { coldWaterPriceMinor: 2_000, inletTemp: 10, outletTemp: 55, lowerHeatingValue: 8_250, gasConsumptionM3: 1_000 },
      units: [
        { unitId: "a", areaM2: 100, heatConsumption: 600, waterConsumption: 3 },
        { unitId: "b", areaM2: 100, heatConsumption: 400, waterConsumption: 1 },
      ],
    });
    // 4 m³ × 1000 × 1,2 × 45 / 8250 = 26,18 m³ gaz × 1000 kuruş/m³ = 26.182
    expect(r.waterHeatingMinor).toBe(26_182);
    const a = r.rows[0]!;
    expect(a.coldWaterMinor).toBe(6_000);
    expect(a.waterHeatingMinor).toBe(Math.ceil((26_181.818 / 4) * 3));
    const heat = r.rows.reduce((s, x) => s + x.commonMinor + x.consumptionMinor, 0);
    expect(Math.abs(heat - (1_000_000 - 26_182))).toBeLessThanOrEqual(4);
  });

  it("yaz suyu: fatura sıcak su tüketimine göre; ya da enerji + kalan m²", () => {
    const units = [
      { unitId: "a", areaM2: 100, heatConsumption: 0, waterConsumption: 3 },
      { unitId: "b", areaM2: 50, heatConsumption: 0, waterConsumption: 1 },
    ];
    const all = computeHeatShares({ ...base, mode: "summer_water", units, water: { coldWaterPriceMinor: 0, inletTemp: 10, outletTemp: 55, lowerHeatingValue: 8_250, gasConsumptionM3: 100 } });
    expect(all.rows.map((x) => x.waterHeatingMinor)).toEqual([750_000, 250_000]);
    expect(all.rows.every((x) => x.consumptionMinor === 0 && x.commonMinor === 0)).toBe(true);
    const split = computeHeatShares({ ...base, mode: "summer_water", summerSplitEnergy: true, units, water: { coldWaterPriceMinor: 0, inletTemp: 10, outletTemp: 55, lowerHeatingValue: 8_250, gasConsumptionM3: 1_000 } });
    expect(Math.abs(split.rows[0]!.commonMinor - 2 * split.rows[1]!.commonMinor)).toBeLessThanOrEqual(1);
  });

  it("hatalar", () => {
    expect(computeHeatShares({ ...base, units: base.units.map((u) => ({ ...u, heatConsumption: 0 })) }).error).toBe("no_heat_consumption");
    expect(computeHeatShares({ ...base, mode: "heat_water", units: base.units.map((u) => ({ ...u, waterConsumption: 1 })) }).error).toBe("water_params");
    expect(computeHeatShares({ ...base, mode: "heat_water", water: { coldWaterPriceMinor: 0, inletTemp: 10, outletTemp: 90, lowerHeatingValue: 100, gasConsumptionM3: 1 }, units: base.units.map((u) => ({ ...u, waterConsumption: 10 })) }).error).toBe("water_exceeds_invoice");
  });
});
