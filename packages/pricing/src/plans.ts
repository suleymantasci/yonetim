import { tlToKurus } from "@yonetim/core";

/**
 * Paket kataloğu — SPEC Bölüm 2.3.
 * Fiyat politikası: Yonetimcell liste fiyatının **yarısı** + 1 ay ücretsiz deneme.
 * `competitorYearlyTl` sadece pazarlama karşılaştırması içindir (Bölüm 15.1).
 */
export interface PlanDefinition {
  code: string;
  name: string;
  tier: number;
  minUnits: number;
  /** null = üst sınır yok (1001+). */
  maxUnits: number | null;
  yearlyPriceTl: number;
  smsQuotaYearly: number;
  competitorYearlyTl: number | null;
  isCustom: boolean;
}

export const TRIAL_PLAN: PlanDefinition = {
  code: "trial",
  name: "Ücretsiz Deneme",
  tier: 0,
  minUnits: 1,
  maxUnits: 30,
  yearlyPriceTl: 0,
  smsQuotaYearly: 30,
  competitorYearlyTl: null,
  isCustom: false,
};

export const STANDARD_PLANS: PlanDefinition[] = [
  { tier: 1, minUnits: 5, maxUnits: 15, yearlyPriceTl: 2_950, smsQuotaYearly: 90, competitorYearlyTl: 5_899 },
  { tier: 2, minUnits: 16, maxUnits: 30, yearlyPriceTl: 4_750, smsQuotaYearly: 150, competitorYearlyTl: 9_499 },
  { tier: 3, minUnits: 31, maxUnits: 50, yearlyPriceTl: 6_250, smsQuotaYearly: 225, competitorYearlyTl: 12_499 },
  { tier: 4, minUnits: 51, maxUnits: 100, yearlyPriceTl: 8_250, smsQuotaYearly: 500, competitorYearlyTl: 16_499 },
  { tier: 5, minUnits: 101, maxUnits: 150, yearlyPriceTl: 10_950, smsQuotaYearly: 750, competitorYearlyTl: 21_899 },
  { tier: 6, minUnits: 151, maxUnits: 200, yearlyPriceTl: 13_950, smsQuotaYearly: 1_000, competitorYearlyTl: 27_899 },
  { tier: 7, minUnits: 201, maxUnits: 300, yearlyPriceTl: 19_950, smsQuotaYearly: 1_500, competitorYearlyTl: 39_899 },
  { tier: 8, minUnits: 301, maxUnits: 400, yearlyPriceTl: 24_450, smsQuotaYearly: 2_000, competitorYearlyTl: 48_899 },
  { tier: 9, minUnits: 401, maxUnits: 500, yearlyPriceTl: 27_950, smsQuotaYearly: 2_500, competitorYearlyTl: 55_899 },
  { tier: 10, minUnits: 501, maxUnits: 600, yearlyPriceTl: 31_950, smsQuotaYearly: 3_000, competitorYearlyTl: 63_899 },
  { tier: 11, minUnits: 601, maxUnits: 700, yearlyPriceTl: 34_950, smsQuotaYearly: 3_500, competitorYearlyTl: 69_899 },
  { tier: 12, minUnits: 701, maxUnits: 800, yearlyPriceTl: 38_950, smsQuotaYearly: 4_000, competitorYearlyTl: 77_899 },
  { tier: 13, minUnits: 801, maxUnits: 900, yearlyPriceTl: 40_950, smsQuotaYearly: 7_500, competitorYearlyTl: 81_899 },
  { tier: 14, minUnits: 901, maxUnits: 1_000, yearlyPriceTl: 42_450, smsQuotaYearly: 8_000, competitorYearlyTl: 84_899 },
  { tier: 15, minUnits: 1_001, maxUnits: null, yearlyPriceTl: 44_450, smsQuotaYearly: 10_000, competitorYearlyTl: 88_899 },
].map((p) => ({
  ...p,
  code: `standart-${p.tier}`,
  name: `Standart ${p.tier}`,
  isCustom: false,
}));

export const ENTERPRISE_PLAN: PlanDefinition = {
  code: "kurumsal",
  name: "Kurumsal",
  tier: 99,
  minUnits: 1,
  maxUnits: null,
  yearlyPriceTl: 0, // pazarlık
  smsQuotaYearly: 0,
  competitorYearlyTl: null,
  isCustom: true,
};

export const ALL_PLANS: PlanDefinition[] = [TRIAL_PLAN, ...STANDARD_PLANS, ENTERPRISE_PLAN];

export const PLAN_FEATURES = {
  /** Tüm paketlerde tüm modüller açık — farklılaşma daire sayısı ve SMS kotasında. */
  standard: {
    modules: "all",
    users: "unlimited",
    storageGb: 25,
    support: "email_whatsapp",
    sla: null,
  },
  enterprise: {
    modules: "all",
    users: "unlimited",
    storageGb: 500,
    support: "dedicated",
    sla: "99.9",
    whiteLabel: true,
    sso: true,
    kvkkAudit: true,
    customDomain: true,
  },
} as const;

/** Daire sayısına göre uygun paketi bulur. Kademe altındaki siteler ilk kademeye girer. */
export function planForUnitCount(unitCount: number): PlanDefinition {
  if (unitCount <= 0) return STANDARD_PLANS[0]!;
  const found = STANDARD_PLANS.find(
    (p) => unitCount >= p.minUnits && (p.maxUnits === null || unitCount <= p.maxUnits),
  );
  if (found) return found;
  // Kademe aralıklarının altında kalan küçük apartmanlar → ilk kademe.
  return unitCount < STANDARD_PLANS[0]!.minUnits
    ? STANDARD_PLANS[0]!
    : STANDARD_PLANS[STANDARD_PLANS.length - 1]!;
}

export function planByCode(code: string): PlanDefinition | undefined {
  return ALL_PLANS.find((p) => p.code === code);
}

export function planYearlyKurus(plan: PlanDefinition): number {
  return tlToKurus(plan.yearlyPriceTl);
}

/** Aylık eşdeğer fiyat (Bölüm 2.3: yıllık / 12). */
export function planMonthlyEquivalentKurus(plan: PlanDefinition): number {
  return Math.round(tlToKurus(plan.yearlyPriceTl) / 12);
}

/** Rakibe göre tasarruf oranı (%) — pricing sayfasında gösterilir. */
export function savingsVsCompetitorPct(plan: PlanDefinition): number | null {
  if (!plan.competitorYearlyTl) return null;
  return Math.round(((plan.competitorYearlyTl - plan.yearlyPriceTl) / plan.competitorYearlyTl) * 100);
}
