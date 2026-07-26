import { distribute, roundHalfUp, type Kurus } from "@yonetim/core";

/**
 * Borçlandırma formülleri — SPEC Bölüm 6.1.
 * Hepsi **deterministik**tir (Bölüm 9.3: aidat hesabında AI yasak).
 */
export type DuesFormula =
  | "equal"
  | "land_share"
  | "area"
  | "person_count"
  | "meter"
  | "mixed"
  | "custom";

export interface UnitForDues {
  id: string;
  /** Arsa payı (ondalık oran veya pay). */
  landShare?: number | null;
  areaM2?: number | null;
  residentCount?: number | null;
  /** Sayaç tüketimi (meter formülünde). */
  consumption?: number | null;
  /** Birime özel çarpan (örn. dükkanlar 2x). */
  multiplier?: number;
  /** Aidattan muaf (boş daire kararı vb.). */
  exempt?: boolean;
  /** custom formülünde birim başı sabit tutar (kuruş). */
  customAmountKurus?: Kurus;
}

export interface DuesDistributionInput {
  formula: DuesFormula;
  /** equal formülünde birim başı tutar. */
  baseAmountKurus?: Kurus;
  /** Diğer formüllerde dağıtılacak toplam havuz. */
  totalAmountKurus?: Kurus;
  /** mixed formülünde ağırlıklar, örn. { equal: 50, land_share: 50 }. */
  mixWeights?: Partial<Record<DuesFormula, number>>;
  units: UnitForDues[];
}

export interface DuesShare {
  unitId: string;
  amountKurus: Kurus;
  weight: number;
  exempt: boolean;
}

export interface DuesDistributionResult {
  shares: DuesShare[];
  totalKurus: Kurus;
  formula: DuesFormula;
  /** Dağıtım tabanı boş kaldığında eşit dağıtıma düşüldüyse. */
  fellBackToEqual: boolean;
}

function weightFor(unit: UnitForDues, formula: DuesFormula): number {
  switch (formula) {
    case "equal":
      return 1;
    case "land_share":
      return num(unit.landShare);
    case "area":
      return num(unit.areaM2);
    case "person_count":
      return num(unit.residentCount);
    case "meter":
      return num(unit.consumption);
    case "custom":
      return num(unit.customAmountKurus);
    case "mixed":
      return 1;
    default:
      return 1;
  }
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Toplam tutarı birimlere dağıtır. Kuruş kaybı olmaz (largest remainder).
 * Muaf birimler 0 alır, onların payı diğerlerine dağılmaz — havuz azalır
 * (aksi halde muafiyet diğer sakinlere yansırdı).
 */
export function distributeDues(input: DuesDistributionInput): DuesDistributionResult {
  const active = input.units.filter((u) => !u.exempt);
  const exempt = input.units.filter((u) => u.exempt);

  // 1) equal: birim başı sabit tutar → dağıtım değil, çarpım.
  if (input.formula === "equal" && input.baseAmountKurus !== undefined) {
    const shares: DuesShare[] = active.map((u) => ({
      unitId: u.id,
      amountKurus: roundHalfUp(input.baseAmountKurus! * (u.multiplier ?? 1)),
      weight: 1,
      exempt: false,
    }));
    return finalize(shares, exempt, input.formula, false);
  }

  // 2) custom: birim bazlı manuel tutarlar.
  if (input.formula === "custom") {
    const shares: DuesShare[] = active.map((u) => ({
      unitId: u.id,
      amountKurus: num(u.customAmountKurus),
      weight: 1,
      exempt: false,
    }));
    return finalize(shares, exempt, input.formula, false);
  }

  const total = input.totalAmountKurus ?? 0;

  // 3) mixed: her bileşen kendi ağırlığıyla ayrı dağıtılır, sonra toplanır.
  if (input.formula === "mixed") {
    const weights = input.mixWeights ?? { equal: 50, land_share: 50 };
    const componentEntries = Object.entries(weights).filter(([, pct]) => (pct ?? 0) > 0) as [
      DuesFormula,
      number,
    ][];
    const pctSum = componentEntries.reduce((a, [, p]) => a + p, 0) || 1;
    const totals = distribute(
      total,
      componentEntries.map(([, p]) => p / pctSum),
    );

    const acc = new Map<string, number>(active.map((u) => [u.id, 0]));
    let anyFallback = false;
    componentEntries.forEach(([componentFormula], i) => {
      const sub = distributeDues({
        formula: componentFormula,
        totalAmountKurus: totals[i] ?? 0,
        units: active,
      });
      anyFallback = anyFallback || sub.fellBackToEqual;
      for (const s of sub.shares) {
        acc.set(s.unitId, (acc.get(s.unitId) ?? 0) + s.amountKurus);
      }
    });

    const shares: DuesShare[] = active.map((u) => ({
      unitId: u.id,
      amountKurus: acc.get(u.id) ?? 0,
      weight: 1,
      exempt: false,
    }));
    return finalize(shares, exempt, "mixed", anyFallback);
  }

  // 4) ağırlıklı dağıtım (land_share / area / person_count / meter)
  let weights = active.map((u) => weightFor(u, input.formula) * (u.multiplier ?? 1));
  let fellBack = false;
  if (weights.every((w) => w <= 0)) {
    // Veri eksik (örn. arsa payı girilmemiş) → eşit dağıtıma düş, uyarı ver.
    weights = active.map(() => 1);
    fellBack = true;
  }
  const amounts = distribute(total, weights);
  const shares: DuesShare[] = active.map((u, i) => ({
    unitId: u.id,
    amountKurus: amounts[i] ?? 0,
    weight: weights[i] ?? 0,
    exempt: false,
  }));
  return finalize(shares, exempt, input.formula, fellBack);
}

function finalize(
  shares: DuesShare[],
  exemptUnits: UnitForDues[],
  formula: DuesFormula,
  fellBackToEqual: boolean,
): DuesDistributionResult {
  const all = [
    ...shares,
    ...exemptUnits.map((u) => ({ unitId: u.id, amountKurus: 0, weight: 0, exempt: true })),
  ];
  return {
    shares: all,
    totalKurus: all.reduce((a, s) => a + s.amountKurus, 0),
    formula,
    fellBackToEqual,
  };
}


/**
 * Formül adları ve açıklamaları i18n katmanındadır:
 * `enum.duesFormula.<formula>` ve `enum.duesFormulaDescription.<formula>`.
 */
export const DUES_FORMULAS: readonly DuesFormula[] = [
  "equal", "land_share", "area", "person_count", "meter", "mixed", "custom",
];
