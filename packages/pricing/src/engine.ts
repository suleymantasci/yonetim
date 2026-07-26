import { siteConfig } from "@yonetim/config";
import { applyPct, roundHalfUp, tlToKurus, type Kurus } from "@yonetim/core";

import { planForUnitCount, planYearlyKurus, type PlanDefinition } from "./plans";

/**
 * SPEC Bölüm 2.3 — Anlaşma yıllık; ödeme 1 yıl / 6 ay / 3 ay / 1 ay seçenekleriyle.
 * Yıllık peşin ödemede indirim uygulanır (Bölüm 16.5 "Yıllık Peşin").
 */
export type BillingPeriod = "yearly" | "semiannual" | "quarterly" | "monthly";

export const BILLING_PERIODS: Record<
  BillingPeriod,
  { months: number; label: string; surchargePct: number }
> = {
  yearly: { months: 12, label: "Yıllık peşin", surchargePct: 0 },
  semiannual: { months: 6, label: "6 aylık", surchargePct: 4 },
  quarterly: { months: 3, label: "3 aylık", surchargePct: 7 },
  monthly: { months: 1, label: "Aylık", surchargePct: 10 },
};

export interface PriceQuote {
  plan: PlanDefinition;
  period: BillingPeriod;
  /** Bir tahsilat döneminde ödenecek tutar. */
  installmentKurus: Kurus;
  /** Yıllık toplam (tüm taksitler). */
  yearlyTotalKurus: Kurus;
  listYearlyKurus: Kurus;
  /** Taksitli ödeme farkı. */
  surchargeKurus: Kurus;
  vatIncluded: true;
  installmentCount: number;
  monthlyEquivalentKurus: Kurus;
  competitorYearlyKurus: Kurus | null;
  savingsVsCompetitorKurus: Kurus | null;
}

/** Liste fiyatı üzerinden teklif üretir (kampanya indirimi ayrı katmanda uygulanır). */
export function quote(unitCount: number, period: BillingPeriod = "yearly"): PriceQuote {
  const plan = planForUnitCount(unitCount);
  return quoteForPlan(plan, period);
}

export function quoteForPlan(plan: PlanDefinition, period: BillingPeriod): PriceQuote {
  const cfg = BILLING_PERIODS[period];
  const listYearly = planYearlyKurus(plan);
  const surcharge = applyPct(listYearly, cfg.surchargePct);
  const yearlyTotal = listYearly + surcharge;
  const installmentCount = 12 / cfg.months;
  return {
    plan,
    period,
    installmentKurus: roundHalfUp(yearlyTotal / installmentCount),
    yearlyTotalKurus: yearlyTotal,
    listYearlyKurus: listYearly,
    surchargeKurus: surcharge,
    vatIncluded: true,
    installmentCount,
    monthlyEquivalentKurus: roundHalfUp(yearlyTotal / 12),
    competitorYearlyKurus: plan.competitorYearlyTl ? tlToKurus(plan.competitorYearlyTl) : null,
    savingsVsCompetitorKurus: plan.competitorYearlyTl
      ? tlToKurus(plan.competitorYearlyTl) - listYearly
      : null,
  };
}

/**
 * Plan yükseltme (upgrade) — anında geçiş, orantılı ücretlendirme (Bölüm 15.1).
 * Kalan gün oranında fark tahsil edilir.
 */
export function prorateUpgrade(params: {
  currentYearlyKurus: Kurus;
  newYearlyKurus: Kurus;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}): { chargeKurus: Kurus; remainingDays: number; totalDays: number } {
  const now = params.now ?? new Date();
  const totalMs = params.periodEnd.getTime() - params.periodStart.getTime();
  const remainingMs = Math.max(0, params.periodEnd.getTime() - now.getTime());
  const totalDays = Math.max(1, Math.round(totalMs / 86_400_000));
  const remainingDays = Math.round(remainingMs / 86_400_000);
  const diff = params.newYearlyKurus - params.currentYearlyKurus;
  const charge = diff <= 0 ? 0 : roundHalfUp((diff * remainingDays) / totalDays);
  return { chargeKurus: charge, remainingDays, totalDays };
}

/** SMS kota aşımı ücreti — Bölüm 15.4 (0.30 ₺/SMS). */
export function smsOverageKurus(used: number, quota: number): Kurus {
  const overage = Math.max(0, used - quota);
  return roundHalfUp(overage * tlToKurus(siteConfig.billing.smsOverageUnitCost));
}

/** Yıl sonu yenileme zammı tavanı — Bölüm 2.3 (TÜFE bazlı, max %30). */
export function renewalPriceKurus(
  previousPriceKurus: Kurus,
  newListPriceKurus: Kurus,
): { priceKurus: Kurus; cappedByPolicy: boolean } {
  const cap = previousPriceKurus + applyPct(previousPriceKurus, siteConfig.billing.maxYearlyPriceIncreasePct);
  if (newListPriceKurus > cap) return { priceKurus: cap, cappedByPolicy: true };
  return { priceKurus: newListPriceKurus, cappedByPolicy: false };
}

/** İade tutarı — 14 gün koşulsuz iade (Bölüm 2.3). */
export function refundAmountKurus(params: {
  paidKurus: Kurus;
  paidAt: Date;
  now?: Date;
}): { refundKurus: Kurus; reason: string } {
  const now = params.now ?? new Date();
  const days = Math.floor((now.getTime() - params.paidAt.getTime()) / 86_400_000);
  if (days <= siteConfig.billing.refundPeriodDays) {
    return { refundKurus: params.paidKurus, reason: "14 gün koşulsuz iade hakkı" };
  }
  return { refundKurus: 0, reason: "Koşulsuz iade süresi doldu" };
}

/** KDV ayrıştırma — liste fiyatları KDV dahildir. */
export function splitVat(grossKurus: Kurus): { netKurus: Kurus; vatKurus: Kurus } {
  const rate = siteConfig.billing.vatRate;
  const net = roundHalfUp(grossKurus / (1 + rate));
  return { netKurus: net, vatKurus: grossKurus - net };
}
