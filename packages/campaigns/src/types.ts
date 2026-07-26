import type { Kurus } from "@yonetim/core";

/** SPEC Bölüm 16.2 — Kampanya veri modeli (esnek mimari). */
export type CampaignType =
  | "free_trial_extension"
  | "x_months_free"
  | "x_percent_off"
  | "x_amount_off"
  | "free_first_period"
  | "referral_reward"
  | "partner_bundled"
  | "migration_credit"
  | "custom";

export type AudienceSegment =
  | "site_manager"
  | "mgmt_company"
  | "new_signup"
  | "migrating"
  | "existing_customer";

export type BillingPeriodName = "monthly" | "quarterly" | "semiannual" | "yearly";

export interface CampaignAudience {
  segments: AudienceSegment[];
  tenantAgeDays?: { min?: number; max?: number };
  currentPackage?: string[];
  hasExistingSubscription?: boolean;
  cities?: string[];
  tenantTypes?: string[];
}

export interface CampaignConditions {
  minUnitCount?: number;
  maxUnitCount?: number;
  /** Taahhüt edilen yıl sayısı (örn. 3 yıl → ilk yıl ücretsiz). */
  commitsToYears?: number;
  /** Partner sözleşmesi (sayaç, enerji, banka ortaklıkları). */
  hasPartnerContract?: string[];
  referralCountRequired?: number;
  minPeriod?: BillingPeriodName;
  /** Rakip sistemden geçiş yapıyor olma şartı. */
  migratingFrom?: string[];
  /** Kalan rakip sözleşme süresi (ay) — "Sözleşmeniz bitene kadar bizden". */
  remainingContractMonths?: { min?: number; max?: number };
  requiresPromoCode?: boolean;
  firstNTenants?: number;
}

export type RewardType =
  | "free_months"
  | "percent_off"
  | "amount_off"
  | "free_period"
  | "credit_balance";

export interface CampaignReward {
  type: RewardType;
  /** 3 (ay), 20 (%), 1000 (TL), 1 (yıl) */
  value: number;
  applicablePeriods?: number;
  maxTotalDiscountTl?: number;
  /** Ömür boyu geçerli mi (örn. Erken Kuş %25). */
  lifetime?: boolean;
}

export interface PromoCode {
  code: string;
  usageLimit?: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  restrictedToTenantId?: string;
  isActive: boolean;
}

export interface Campaign {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
  type: CampaignType;
  status: "draft" | "active" | "paused" | "expired";
  audience: CampaignAudience;
  conditions: CampaignConditions;
  reward: CampaignReward;
  startsAt: Date;
  endsAt: Date;
  usageLimit?: number;
  usageCount: number;
  perTenantLimit?: number;
  showOnPricingPage: boolean;
  badge?: string;
  stackable: boolean;
  promoCodes?: PromoCode[];
  metadata: Record<string, unknown>;
}

/** Kampanya değerlendirmesine giren satın alma adayı. */
export interface PurchaseCandidate {
  planCode: string;
  unitCount: number;
  period: BillingPeriodName;
  listPriceKurus: Kurus;
  /** Bir tahsilat dönemindeki tutar. */
  installmentKurus: Kurus;
  commitsToYears?: number;
  promoCode?: string;
  migratingFrom?: string;
  remainingContractMonths?: number;
  partnerContracts?: string[];
  referralCount?: number;
}

export interface TenantSnapshot {
  id: string;
  createdAt: Date;
  unitCount: number;
  city?: string;
  type?: string;
  segment: AudienceSegment;
  hasExistingSubscription: boolean;
  currentPlanCode?: string;
  /** Bu tenant'ın daha önce kullandığı kampanya id'leri. */
  usedCampaignIds: string[];
  /** Kayıt sırası (Erken Kuş kampanyası için). */
  signupRank?: number;
}

export interface ApplicableCampaign {
  campaign: Campaign;
  discountKurus: Kurus;
  freeMonths: number;
  finalPriceKurus: Kurus;
  reason: string;
  lifetime: boolean;
}
