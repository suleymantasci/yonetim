import {
  addMonths, applyPct, periodKey, roundHalfUp, type Kurus, type Period,
} from "@yonetim/core";

/**
 * Bütçe / Aidat Simülatörü — VURUCU ÖZELLİK, SPEC Bölüm 3.4.
 * "Aidatı %20 artırırsam ne olur?" sorusunu Excel'siz yanıtlar.
 * Tamamen deterministik (AI yok).
 */

export interface SimulationInput {
  startPeriod: Period;
  months?: number;
  unitCount: number;
  /** Mevcut aylık toplam aidat tahakkuku (kuruş). */
  currentMonthlyDuesKurus: Kurus;
  /** Aidat artış oranı (%). */
  increasePct: number;
  /** Artışın uygulanacağı ay (1 = ilk ay). */
  increaseFromMonth?: number;
  /** Aylık ortalama gider (kuruş). */
  monthlyExpenseKurus: Kurus;
  /** Gider enflasyonu (yıllık %) — aylık bileşiğe çevrilir. */
  expenseInflationAnnualPct?: number;
  /** Açılış kasa/banka bakiyesi. */
  openingBalanceKurus: Kurus;
  /** Geçmiş tahsilat oranı (0-1). */
  collectionRate: number;
  /**
   * Aidat artışının tahsilat oranına etkisi.
   * Ampirik varsayım: her %10 artış tahsilat oranını ~1.5 puan düşürür.
   */
  collectionElasticity?: number;
  /** Tek seferlik ek bütçe kalemleri (dış cephe, asansör yenileme vb.). */
  extraItems?: { month: number; label: string; amountKurus: Kurus; spreadMonths?: number }[];
  /** Geçen yılın aylık gerçekleşen tahsilatı (karşılaştırma için). */
  previousYearMonthlyCollectionKurus?: Kurus[];
}

export interface SimulationMonth {
  period: Period;
  /** `2026-03` biçiminde dönem anahtarı; ay adı UI'da diline göre biçimlendirilir. */
  periodKey: string;
  accruedDuesKurus: Kurus;
  expectedCollectionKurus: Kurus;
  expenseKurus: Kurus;
  extraExpenseKurus: Kurus;
  netKurus: Kurus;
  closingBalanceKurus: Kurus;
  perUnitDuesKurus: Kurus;
  collectionRate: number;
  previousYearCollectionKurus?: Kurus;
}

export interface SimulationResult {
  months: SimulationMonth[];
  summary: {
    totalAccruedKurus: Kurus;
    totalCollectionKurus: Kurus;
    totalExpenseKurus: Kurus;
    endingBalanceKurus: Kurus;
    minBalanceKurus: Kurus;
    /** Dönem anahtarı (`2026-03`). */
    minBalanceMonth: string;
    /** Bakiye eksiye düşen ilk dönemin anahtarı (varsa). */
    firstDeficitMonth: string | null;
    newPerUnitMonthlyKurus: Kurus;
    oldPerUnitMonthlyKurus: Kurus;
    perUnitDeltaKurus: Kurus;
    estimatedCollectionRate: number;
    /** Gideri karşılamak için gereken minimum artış (%). */
    requiredIncreasePct: number;
  };
  /**
   * Uyarılar dile bağımsızdır: `code` i18n anahtarına
   * (`app.simulator.warning.<code>`) karşılık gelir, `params` yer tutucuları
   * doldurur.
   */
  warnings: SimulationWarning[];
}

export interface SimulationWarning {
  code: "deficit" | "largeIncrease" | "lowCollection" | "spreadExtra";
  params?: Record<string, string | number>;
}

export function simulate(input: SimulationInput): SimulationResult {
  const months = input.months ?? 12;
  const increaseFrom = input.increaseFromMonth ?? 1;
  const elasticity = input.collectionElasticity ?? 0.15;
  const inflationMonthly =
    (input.expenseInflationAnnualPct ?? 0) > 0
      ? Math.pow(1 + (input.expenseInflationAnnualPct ?? 0) / 100, 1 / 12) - 1
      : 0;

  // Artışın tahsilat oranına etkisi (puan cinsinden).
  const rateDrop = (input.increasePct / 10) * elasticity;
  const adjustedRate = clamp(input.collectionRate - rateDrop / 100, 0.3, 1);

  const rows: SimulationMonth[] = [];
  let balance = input.openingBalanceKurus;
  let minBalance = balance;
  let minBalanceMonth = periodKey(input.startPeriod);
  let firstDeficit: string | null = null;

  for (let i = 0; i < months; i++) {
    const period = addMonths(input.startPeriod, i);
    const monthNo = i + 1;
    const applyIncrease = monthNo >= increaseFrom;
    const accrued = applyIncrease
      ? input.currentMonthlyDuesKurus + applyPct(input.currentMonthlyDuesKurus, input.increasePct)
      : input.currentMonthlyDuesKurus;
    const rate = applyIncrease ? adjustedRate : input.collectionRate;
    const collection = roundHalfUp(accrued * rate);
    const expense = roundHalfUp(input.monthlyExpenseKurus * Math.pow(1 + inflationMonthly, i));

    let extra = 0;
    for (const item of input.extraItems ?? []) {
      const spread = Math.max(1, item.spreadMonths ?? 1);
      if (monthNo >= item.month && monthNo < item.month + spread) {
        extra += roundHalfUp(item.amountKurus / spread);
      }
    }

    const net = collection - expense - extra;
    balance += net;
    if (balance < minBalance) {
      minBalance = balance;
      minBalanceMonth = periodKey(period);
    }
    if (balance < 0 && firstDeficit === null) firstDeficit = periodKey(period);

    rows.push({
      period,
      periodKey: periodKey(period),
      accruedDuesKurus: accrued,
      expectedCollectionKurus: collection,
      expenseKurus: expense,
      extraExpenseKurus: extra,
      netKurus: net,
      closingBalanceKurus: balance,
      perUnitDuesKurus: input.unitCount > 0 ? roundHalfUp(accrued / input.unitCount) : 0,
      collectionRate: rate,
      previousYearCollectionKurus: input.previousYearMonthlyCollectionKurus?.[i],
    });
  }

  const totalAccrued = rows.reduce((a, r) => a + r.accruedDuesKurus, 0);
  const totalCollection = rows.reduce((a, r) => a + r.expectedCollectionKurus, 0);
  const totalExpense = rows.reduce((a, r) => a + r.expenseKurus + r.extraExpenseKurus, 0);

  // Gideri karşılayan minimum artış: (toplam gider / tahsilat oranı) / mevcut tahakkuk - 1
  const baselineAccrual = input.currentMonthlyDuesKurus * months;
  const requiredIncreasePct =
    baselineAccrual > 0
      ? Math.max(
          0,
          roundHalfUp(
            ((totalExpense - input.openingBalanceKurus) / adjustedRate / baselineAccrual - 1) * 1000,
          ) / 10,
        )
      : 0;

  const oldPerUnit =
    input.unitCount > 0 ? roundHalfUp(input.currentMonthlyDuesKurus / input.unitCount) : 0;
  const newPerUnit = rows[rows.length - 1]?.perUnitDuesKurus ?? oldPerUnit;

  const warnings: SimulationWarning[] = [];
  if (firstDeficit) {
    warnings.push({
      code: "deficit",
      params: { month: firstDeficit, pct: requiredIncreasePct },
    });
  }
  if (input.increasePct > 50) {
    warnings.push({ code: "largeIncrease" });
  }
  if (adjustedRate < 0.75) {
    warnings.push({ code: "lowCollection", params: { pct: Math.round(adjustedRate * 100) } });
  }
  if ((input.extraItems ?? []).length > 0 && minBalance < 0) {
    warnings.push({ code: "spreadExtra" });
  }

  return {
    months: rows,
    summary: {
      totalAccruedKurus: totalAccrued,
      totalCollectionKurus: totalCollection,
      totalExpenseKurus: totalExpense,
      endingBalanceKurus: balance,
      minBalanceKurus: minBalance,
      minBalanceMonth,
      firstDeficitMonth: firstDeficit,
      newPerUnitMonthlyKurus: newPerUnit,
      oldPerUnitMonthlyKurus: oldPerUnit,
      perUnitDeltaKurus: newPerUnit - oldPerUnit,
      estimatedCollectionRate: adjustedRate,
      requiredIncreasePct,
    },
    warnings,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Simülasyon sonucunu CSV'ye çevirir (Excel export — Bölüm 6.13).
 * Sütun başlıkları çağıran katmandan gelir; paket dile bağımsız kalır.
 */
export function simulationToCsv(result: SimulationResult, headers: string[]): string {
  const header = headers.join(";");
  const lines = result.months.map((m) =>
    [
      m.periodKey,
      m.accruedDuesKurus / 100,
      m.expectedCollectionKurus / 100,
      m.expenseKurus / 100,
      m.extraExpenseKurus / 100,
      m.netKurus / 100,
      m.closingBalanceKurus / 100,
      m.perUnitDuesKurus / 100,
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}
