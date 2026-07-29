import { applyPct, roundHalfUp, tlToKurus, type Kurus } from "@yonetim/core";

import type {
  ApplicableCampaign, Campaign, PurchaseCandidate, TenantSnapshot,
} from "./types";

/** SPEC Bölüm 16.3 — Kampanya motoru. */

export function matchesAudience(c: Campaign, tenant: TenantSnapshot, now = new Date()): boolean {
  const a = c.audience;
  if (a.segments?.length && !a.segments.includes(tenant.segment)) return false;

  if (a.tenantAgeDays) {
    const ageDays = Math.floor((now.getTime() - tenant.createdAt.getTime()) / 86_400_000);
    if (a.tenantAgeDays.min !== undefined && ageDays < a.tenantAgeDays.min) return false;
    if (a.tenantAgeDays.max !== undefined && ageDays > a.tenantAgeDays.max) return false;
  }
  if (a.currentPackage?.length) {
    if (!tenant.currentPlanCode || !a.currentPackage.includes(tenant.currentPlanCode)) return false;
  }
  if (a.hasExistingSubscription !== undefined && a.hasExistingSubscription !== tenant.hasExistingSubscription) {
    return false;
  }
  if (a.cities?.length && (!tenant.city || !a.cities.includes(tenant.city))) return false;
  if (a.tenantTypes?.length && (!tenant.type || !a.tenantTypes.includes(tenant.type))) return false;
  return true;
}

export function matchesConditions(
  c: Campaign,
  tenant: TenantSnapshot,
  candidate: PurchaseCandidate,
): boolean {
  const k = c.conditions;
  if (k.minUnitCount !== undefined && candidate.unitCount < k.minUnitCount) return false;
  if (k.maxUnitCount !== undefined && candidate.unitCount > k.maxUnitCount) return false;
  /*
   * Çoklu site eşiği. Varsayılan 1, `undefined` değil: site sayısı
   * bilinmiyorsa "en az bir sitesi var" doğru varsayım (aksi hâlde tek siteli
   * hesaplar `minTenantCount: 1` koşulunu bile geçemezdi).
   */
  if (
    k.minTenantCount !== undefined &&
    (tenant.managedTenantCount ?? 1) < k.minTenantCount
  ) {
    return false;
  }
  if (k.commitsToYears !== undefined && (candidate.commitsToYears ?? 0) < k.commitsToYears) return false;
  if (k.referralCountRequired !== undefined && (candidate.referralCount ?? 0) < k.referralCountRequired) {
    return false;
  }
  if (k.minPeriod && !periodAtLeast(candidate.period, k.minPeriod)) return false;
  if (k.hasPartnerContract?.length) {
    const owned = candidate.partnerContracts ?? [];
    if (!k.hasPartnerContract.some((p) => owned.includes(p))) return false;
  }
  if (k.migratingFrom?.length) {
    if (!candidate.migratingFrom || !k.migratingFrom.includes(candidate.migratingFrom)) return false;
  }
  if (k.remainingContractMonths) {
    const m = candidate.remainingContractMonths ?? 0;
    if (k.remainingContractMonths.min !== undefined && m < k.remainingContractMonths.min) return false;
    if (k.remainingContractMonths.max !== undefined && m > k.remainingContractMonths.max) return false;
  }
  if (k.requiresPromoCode) {
    if (!candidate.promoCode) return false;
    const valid = (c.promoCodes ?? []).some(
      (p) =>
        p.isActive &&
        p.code.toUpperCase() === candidate.promoCode!.toUpperCase() &&
        (!p.usageLimit || p.usedCount < p.usageLimit) &&
        (!p.restrictedToTenantId || p.restrictedToTenantId === tenant.id),
    );
    if (!valid) return false;
  }
  if (k.firstNTenants !== undefined) {
    if ((tenant.signupRank ?? Number.MAX_SAFE_INTEGER) > k.firstNTenants) return false;
  }
  return true;
}

const PERIOD_ORDER: Record<string, number> = {
  monthly: 1, quarterly: 2, semiannual: 3, yearly: 4,
};

function periodAtLeast(actual: string, min: string): boolean {
  return (PERIOD_ORDER[actual] ?? 0) >= (PERIOD_ORDER[min] ?? 0);
}

export function usageAvailable(c: Campaign, tenant: TenantSnapshot, now = new Date()): boolean {
  if (c.status !== "active") return false;
  if (now < c.startsAt || now > c.endsAt) return false;
  if (c.usageLimit !== undefined && c.usageCount >= c.usageLimit) return false;
  const usedByTenant = tenant.usedCampaignIds.filter((id) => id === c.id).length;
  if ((c.perTenantLimit ?? 1) <= usedByTenant) return false;
  return true;
}

/** Kampanyanın parasal karşılığını hesaplar (yıllık toplam üzerinden). */
export function computeReward(c: Campaign, candidate: PurchaseCandidate): ApplicableCampaign {
  const list = candidate.listPriceKurus;
  let discount: Kurus = 0;
  let freeMonths = 0;
  let reason = "";

  switch (c.reward.type) {
    case "free_months": {
      freeMonths = c.reward.value;
      // 12 ay muafiyette tam liste fiyatı düşer; aylık tutarı çarpmak kuruş kaybı yaratır.
      discount = Math.min(list, roundHalfUp((list * freeMonths) / 12));
      reason = `${freeMonths} ay ücretsiz`;
      break;
    }
    case "percent_off": {
      discount = applyPct(list, c.reward.value);
      reason = `%${c.reward.value} indirim`;
      break;
    }
    case "amount_off": {
      discount = Math.min(list, tlToKurus(c.reward.value));
      reason = `${c.reward.value} ₺ indirim`;
      break;
    }
    case "free_period": {
      freeMonths = 12 * c.reward.value;
      discount = Math.min(list, roundHalfUp((list * freeMonths) / 12));
      reason = c.reward.value === 1 ? "İlk yıl ücretsiz" : `${c.reward.value} yıl ücretsiz`;
      break;
    }
    case "credit_balance": {
      discount = Math.min(list, tlToKurus(c.reward.value));
      reason = `${c.reward.value} ₺ hesap kredisi`;
      break;
    }
    default:
      discount = 0;
  }

  if (c.reward.maxTotalDiscountTl !== undefined) {
    discount = Math.min(discount, tlToKurus(c.reward.maxTotalDiscountTl));
  }
  discount = Math.max(0, Math.min(discount, list));

  return {
    campaign: c,
    discountKurus: discount,
    freeMonths,
    finalPriceKurus: list - discount,
    reason,
    lifetime: c.reward.lifetime ?? false,
  };
}

/** SPEC Bölüm 16.3 — uygun kampanyaları indirim büyüklüğüne göre sıralar. */
export function evaluateCampaigns(
  activeCampaigns: Campaign[],
  tenant: TenantSnapshot,
  candidate: PurchaseCandidate,
  now = new Date(),
): ApplicableCampaign[] {
  return activeCampaigns
    .filter((c) => usageAvailable(c, tenant, now))
    .filter((c) => matchesAudience(c, tenant, now))
    .filter((c) => matchesConditions(c, tenant, candidate))
    .map((c) => computeReward(c, candidate))
    .sort((a, b) => b.discountKurus - a.discountKurus);
}

export interface BestCampaignResult {
  best: ApplicableCampaign | null;
  applied: ApplicableCampaign[];
  finalPriceKurus: Kurus;
  savingsKurus: Kurus;
  reasons: string[];
  allApplicable: ApplicableCampaign[];
}

/**
 * En avantajlı kampanyayı uygular. `stackable: true` olan kampanyalar
 * en iyi kampanyanın üzerine eklenebilir (Bölüm 16.7 — varsayılan false).
 */
export function applyBestCampaign(
  candidate: PurchaseCandidate,
  campaigns: ApplicableCampaign[],
): BestCampaignResult {
  if (campaigns.length === 0) {
    return {
      best: null,
      applied: [],
      finalPriceKurus: candidate.listPriceKurus,
      savingsKurus: 0,
      reasons: [],
      allApplicable: [],
    };
  }

  const best = campaigns[0]!;
  const applied = [best];
  let price = candidate.listPriceKurus - best.discountKurus;

  if (best.campaign.stackable) {
    for (const extra of campaigns.slice(1)) {
      if (!extra.campaign.stackable) continue;
      const extraDiscount = Math.min(price, extra.discountKurus);
      if (extraDiscount <= 0) continue;
      price -= extraDiscount;
      applied.push({ ...extra, discountKurus: extraDiscount, finalPriceKurus: price });
    }
  }

  price = Math.max(0, price);
  return {
    best,
    applied,
    finalPriceKurus: price,
    savingsKurus: candidate.listPriceKurus - price,
    reasons: applied.map((a) => `${a.campaign.name}: ${a.reason}`),
    allApplicable: campaigns,
  };
}

/**
 * Kötüye kullanım kontrolü — Bölüm 16.7.
 * Aynı TCKN/IBAN/telefon ile çoklu kayıt tespiti.
 */
export interface FraudSignal {
  code: string;
  severity: "block" | "review";
  message: string;
}

export function detectCampaignFraud(input: {
  sameTcknTenantCount: number;
  sameIbanTenantCount: number;
  samePhoneTenantCount: number;
  sameIpSignups24h: number;
  referralSelfMatch: boolean;
}): FraudSignal[] {
  const signals: FraudSignal[] = [];
  if (input.referralSelfMatch) {
    signals.push({
      code: "self_referral",
      severity: "block",
      message: "Tavsiye eden ve edilen aynı kişiye ait görünüyor.",
    });
  }
  if (input.sameTcknTenantCount > 3) {
    signals.push({
      code: "tckn_multi_tenant",
      severity: "review",
      message: `Aynı T.C. kimlik numarası ${input.sameTcknTenantCount} sitede yönetici — profesyonel yönetim firması olabilir, doğrulayın.`,
    });
  }
  if (input.sameIbanTenantCount > 3) {
    signals.push({
      code: "iban_multi_tenant",
      severity: "review",
      message: `Aynı IBAN ${input.sameIbanTenantCount} sitede kayıtlı.`,
    });
  }
  if (input.samePhoneTenantCount > 5) {
    signals.push({
      code: "phone_multi_tenant",
      severity: "review",
      message: "Aynı telefon numarası çok sayıda sitede kayıtlı.",
    });
  }
  if (input.sameIpSignups24h > 5) {
    signals.push({
      code: "ip_burst",
      severity: "block",
      message: "Aynı IP'den 24 saat içinde çok sayıda kayıt.",
    });
  }
  return signals;
}
