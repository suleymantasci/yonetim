/**
 * Isı pay ölçerli (merkezi ısıtma) gider paylaşımı — saf hesap.
 *
 * Yönetimcell'in "ısı ölçer hesaplamalı", "yakıt + su" ve "yaz dönemi su"
 * borçlandırmalarıyla aynı mantık (2026-10-09 sayfa betiklerinden):
 *
 *  1. Tüketim = son − ilk endeks (negatifse 0).
 *  2. Asgari tüketim (emsal): `minConsumptionPct` verilirse, m² başına
 *     tüketimi bina ortalamasının bu yüzdesinin altında kalan (okunamayan,
 *     ısıtmayı kapatan) daire bu değerden sayılır → düzeltilmiş tüketim.
 *  3. Yakıt+su: sıcak su ısıtma enerjisi faturadan önce ayrılır —
 *     su m³ × 1000 × 1,2 × (çıkan − giren °C) / alt ısıl değer (kcal/m³)
 *     × (fatura / toplam gaz m³); su sayacına göre paylaşılır.
 *  4. Kalan fatura: `commonPct` (varsayılan %30) m²'ye göre ortak pay,
 *     geri kalanı düzeltilmiş tüketime göre.
 *  5. Daire tutarı = ortak + tüketim + soğuk su (m³ × birim) + su ısıtma
 *     + okuma bedeli; her kalem yukarı (kuruş) yuvarlanır; istenirse toplam
 *     yukarı tam liraya ya da 10 kuruşa.
 *
 * Yaz dönemi su: ısıtma yok; su ısıtma enerjisi hesaplanıp kalan m²'ye
 * (`summerSplitEnergy`) ya da faturanın tamamı sıcak su tüketimine göre.
 */
export type HeatMode = "heat" | "heat_water" | "summer_water";
export type HeatRounding = "none" | "lira" | "ten_kurus";

export interface HeatUnitInput {
  unitId: string;
  areaM2: number;
  heatConsumption: number;
  waterConsumption: number;
}

export interface HeatInput {
  mode: HeatMode;
  invoiceMinor: number;
  commonPct: number;
  minConsumptionPct: number | null;
  readingFeeMinor: number;
  rounding: HeatRounding;
  water?: {
    coldWaterPriceMinor: number;
    inletTemp: number;
    outletTemp: number;
    lowerHeatingValue: number;
    gasConsumptionM3: number;
  };
  summerSplitEnergy?: boolean;
  units: HeatUnitInput[];
}

export interface HeatRow {
  unitId: string;
  adjustedConsumption: number;
  commonMinor: number;
  consumptionMinor: number;
  coldWaterMinor: number;
  waterHeatingMinor: number;
  readingFeeMinor: number;
  totalMinor: number;
  /** Asgari tüketim uygulandı. */
  minApplied: boolean;
}

export type HeatError = "no_area" | "no_heat_consumption" | "no_water_consumption" | "water_exceeds_invoice" | "water_params";

export function computeHeatShares(input: HeatInput): { rows: HeatRow[]; waterHeatingMinor: number; error: HeatError | null } {
  const units = input.units.map((u) => ({
    ...u,
    heat: Math.max(0, u.heatConsumption),
    water: Math.max(0, u.waterConsumption),
  }));
  const totalArea = units.reduce((s, u) => s + u.areaM2, 0);
  const totalHeat = units.reduce((s, u) => s + u.heat, 0);
  const totalWater = units.reduce((s, u) => s + u.water, 0);
  const empty = (error: HeatError) => ({ rows: [], waterHeatingMinor: 0, error });
  if (totalArea <= 0) return empty("no_area");
  if (input.mode !== "summer_water" && totalHeat <= 0) return empty("no_heat_consumption");
  if (input.mode !== "heat" && totalWater <= 0) return empty("no_water_consumption");

  // 3) Su ısıtma enerjisi
  let waterHeating = 0;
  const w = input.water;
  const needsEnergy = input.mode === "heat_water" || (input.mode === "summer_water" && input.summerSplitEnergy);
  if (needsEnergy) {
    if (!w || w.lowerHeatingValue <= 0 || w.gasConsumptionM3 <= 0 || w.outletTemp <= w.inletTemp) return empty("water_params");
    waterHeating =
      ((totalWater * 1000 * 1.2 * (w.outletTemp - w.inletTemp)) / w.lowerHeatingValue) * (input.invoiceMinor / w.gasConsumptionM3);
    if (waterHeating > input.invoiceMinor) return empty("water_exceeds_invoice");
  } else if (input.mode === "summer_water") {
    waterHeating = input.invoiceMinor;
  }
  const remaining = input.invoiceMinor - waterHeating;

  // 2) Asgari tüketim (yalnız ısıtma dönemi)
  const perM2 = totalHeat / totalArea;
  const floor = input.minConsumptionPct !== null && input.minConsumptionPct > 0 ? (perM2 * input.minConsumptionPct) / 100 : 0;
  const adjusted = units.map((u) => {
    if (input.mode === "summer_water") return { u, c: 0, min: false };
    const min = u.areaM2 * floor;
    return u.heat < min ? { u, c: Math.ceil(min * 1000) / 1000, min: true } : { u, c: u.heat, min: false };
  });
  const totalAdjusted = adjusted.reduce((s, a) => s + a.c, 0);

  // 4) Ortak / tüketim
  const commonPool = input.mode === "summer_water" ? remaining : (remaining * input.commonPct) / 100;
  const consumptionPool = input.mode === "summer_water" ? 0 : remaining - commonPool;
  const commonPerM2 = commonPool / totalArea;
  const pricePerUnit = totalAdjusted > 0 ? consumptionPool / totalAdjusted : 0;

  const rows = adjusted.map(({ u, c, min }) => {
    const commonMinor = Math.ceil(u.areaM2 * commonPerM2);
    const consumptionMinor = Math.ceil(c * pricePerUnit);
    const coldWaterMinor = input.mode !== "heat" && w ? Math.ceil(u.water * w.coldWaterPriceMinor) : 0;
    const waterHeatingMinor = input.mode !== "heat" && totalWater > 0 ? Math.ceil((waterHeating / totalWater) * u.water) : 0;
    const raw = commonMinor + consumptionMinor + coldWaterMinor + waterHeatingMinor + input.readingFeeMinor;
    const totalMinor =
      input.rounding === "lira" ? Math.ceil(raw / 100) * 100 : input.rounding === "ten_kurus" ? Math.ceil(raw / 10) * 10 : raw;
    return {
      unitId: u.unitId,
      adjustedConsumption: c,
      commonMinor,
      consumptionMinor,
      coldWaterMinor,
      waterHeatingMinor,
      readingFeeMinor: input.readingFeeMinor,
      totalMinor,
      minApplied: min,
    };
  });
  return { rows, waterHeatingMinor: Math.round(waterHeating), error: null };
}
