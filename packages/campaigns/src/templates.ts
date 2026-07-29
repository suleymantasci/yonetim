import type { Campaign, CampaignConditions, CampaignReward, CampaignType } from "./types";

/**
 * Hazır kampanya şablonları — SPEC Bölüm 16.5.
 * Super-admin "şablondan başla" der, wizard bu tanımı ön-doldurur (Bölüm 16.4).
 *
 * Metinler i18n katmanındadır; şablon yalnızca `key` ve iş kurallarını taşır:
 *   marketing.campaigns.template.<key>.name
 *   marketing.campaigns.template.<key>.description
 *   marketing.campaigns.template.<key>.headline
 *   marketing.campaigns.template.<key>.bullets  (dizi)
 */
export interface CampaignTemplate {
  key: string;
  type: CampaignType;
  audience: Campaign["audience"];
  conditions: CampaignConditions;
  reward: CampaignReward;
  /** Rozet metni i18n'de: `marketing.campaigns.badge.<badge>`. */
  badge?: string;
  stackable: boolean;
  defaultDurationDays: number;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "yeni_site_hosgeldin",
    type: "free_trial_extension",
    audience: { segments: ["new_signup"] },
    conditions: {},
    reward: { type: "free_months", value: 1 },
    badge: "new",
    stackable: true,
    defaultDurationDays: 365,
  },
  {
    key: "uc_yil_taahhut_ilk_yil_bedava",
    type: "free_first_period",
    audience: { segments: ["site_manager", "new_signup"] },
    conditions: { commitsToYears: 3, minPeriod: "yearly" },
    reward: { type: "free_period", value: 1 },
    badge: "popular",
    stackable: false,
    defaultDurationDays: 180,
  },
  {
    key: "yonetim_firmasi_6_ay",
    type: "x_months_free",
    audience: { segments: ["mgmt_company"], hasExistingSubscription: false },
    conditions: { minPeriod: "yearly" },
    reward: { type: "free_months", value: 6 },
    badge: "limited",
    stackable: false,
    defaultDurationDays: 120,
  },
  {
    key: "yonetim_firmasi_3_ay",
    type: "x_months_free",
    audience: { segments: ["mgmt_company"] },
    conditions: {},
    reward: { type: "free_months", value: 3 },
    stackable: false,
    defaultDurationDays: 180,
  },
  /*
   * Çoklu site indirimi — kademeli, 2026-07-29 kararı.
   *
   * NEDEN İKİ KADEME VE NEDEN `stackable: true`: yönetim firması indirimi
   * ölçek indirimidir, kampanya değil. "İlk 6 ay bedava" gibi bir kazanım
   * kampanyasının yerine geçmemeli — firma hem yeni müşteri kazanım
   * kampanyasından hem ölçek indiriminden yararlanabilmeli. Bu yüzden
   * yığılabilir; motorun `applyBestCampaign`'i yığılabilir olanları
   * birleştiriyor.
   *
   * Eşikler `minTenantCount` üzerinden: `minUnitCount` firmanın büyüklüğünü
   * ölçemiyor (bkz. `CampaignConditions.minTenantCount` gerekçesi).
   */
  {
    key: "coklu_site_5_plus",
    type: "x_percent_off",
    audience: { segments: ["mgmt_company"] },
    conditions: { minTenantCount: 5 },
    reward: { type: "percent_off", value: 10, lifetime: true },
    badge: "saving",
    stackable: true,
    defaultDurationDays: 730,
  },
  {
    key: "coklu_site_15_plus",
    type: "x_percent_off",
    audience: { segments: ["mgmt_company"] },
    conditions: { minTenantCount: 15 },
    reward: { type: "percent_off", value: 20, lifetime: true },
    badge: "saving",
    stackable: true,
    defaultDurationDays: 730,
  },
  {
    key: "gecis_kampanyasi",
    type: "migration_credit",
    audience: { segments: ["migrating"] },
    conditions: {
      migratingFrom: ["apsiyon", "biyos", "dijiyon", "yonetimcell", "diger"],
      remainingContractMonths: { min: 1, max: 12 },
    },
    reward: { type: "free_months", value: 12, maxTotalDiscountTl: 44_450 },
    badge: "switch",
    stackable: false,
    defaultDurationDays: 365,
  },
  {
    key: "tavsiye_et_kazan",
    type: "referral_reward",
    audience: { segments: ["site_manager", "mgmt_company", "existing_customer"] },
    conditions: { referralCountRequired: 1 },
    reward: { type: "free_months", value: 1, maxTotalDiscountTl: 10_000 },
    badge: "earn",
    stackable: true,
    defaultDurationDays: 730,
  },
  {
    key: "partner_sayac_ortakligi",
    type: "partner_bundled",
    audience: { segments: ["site_manager", "mgmt_company", "new_signup"] },
    conditions: { hasPartnerContract: ["bulut_enerji", "sayac_partner", "akbank"] },
    reward: { type: "percent_off", value: 100, lifetime: true },
    badge: "partner",
    stackable: false,
    defaultDurationDays: 730,
  },
  {
    key: "yillik_pesin_indirim",
    type: "x_percent_off",
    audience: { segments: ["site_manager", "mgmt_company", "new_signup"] },
    conditions: { minPeriod: "yearly" },
    reward: { type: "percent_off", value: 17 },
    badge: "saving",
    stackable: true,
    defaultDurationDays: 730,
  },
  {
    key: "erken_kus",
    type: "x_percent_off",
    audience: { segments: ["new_signup"] },
    conditions: { firstNTenants: 100 },
    reward: { type: "percent_off", value: 25, lifetime: true },
    badge: "first100",
    stackable: false,
    defaultDurationDays: 90,
  },
  {
    key: "black_friday",
    type: "x_percent_off",
    audience: { segments: ["new_signup", "site_manager", "mgmt_company"] },
    conditions: { minPeriod: "yearly", requiresPromoCode: true },
    reward: { type: "percent_off", value: 30 },
    badge: "limitedTime",
    stackable: false,
    defaultDurationDays: 7,
  },
  {
    key: "cevre_dostu",
    type: "x_percent_off",
    audience: { segments: ["existing_customer"] },
    conditions: {},
    reward: { type: "percent_off", value: 10 },
    badge: "green",
    stackable: true,
    defaultDurationDays: 365,
  },
];

export function templateByKey(key: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.key === key);
}

/** Şablondan taslak kampanya üretir (super-admin wizard başlangıcı). */
export function draftFromTemplate(
  template: CampaignTemplate,
  overrides: Partial<Campaign> = {},
  now = new Date(),
): Omit<Campaign, "id"> {
  const endsAt = new Date(now.getTime() + template.defaultDurationDays * 86_400_000);
  return {
    code: template.key.toUpperCase().replace(/_/g, "-"),
    slug: template.key.replace(/_/g, "-"),
    // Ad ve açıklama i18n'den gelir; DB kaydında varsayılan dil saklanır.
    name: template.key,
    description: "",
    type: template.type,
    status: "draft",
    audience: template.audience,
    conditions: template.conditions,
    reward: template.reward,
    startsAt: now,
    endsAt,
    usageCount: 0,
    perTenantLimit: 1,
    showOnPricingPage: true,
    badge: template.badge,
    stackable: template.stackable,
    metadata: { templateKey: template.key },
    ...overrides,
  };
}
