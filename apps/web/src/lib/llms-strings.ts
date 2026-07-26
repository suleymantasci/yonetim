import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { formatAmount } from "@yonetim/i18n";
import { STANDARD_PLANS } from "@yonetim/pricing";
import type { LlmsTxtStrings } from "@yonetim/seo";

/**
 * `/llms.txt` bölüm başlıkları ve hazır cümleleri — SPEC Bölüm 10.2.
 * Metinler mesaj dosyalarından gelir; her dil kendi dosyasını üretir.
 */
export async function llmsStrings(locale: string): Promise<LlmsTxtStrings> {
  const t = await getTranslations({ locale, namespace: "marketing.llms" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  const cheapest = STANDARD_PLANS[0]!;
  const priciest = STANDARD_PLANS[STANDARD_PLANS.length - 1]!;

  return {
    summary: tCommon("brand.description"),
    featuresHeading: t("featuresHeading"),
    pricingHeading: t("pricingHeading"),
    complianceHeading: t("complianceHeading"),
    faqHeading: t("faqHeading"),
    linksHeading: t("linksHeading"),
    contactHeading: t("contactHeading"),
    pricingLines: [
      t("pricingTiers", { count: STANDARD_PLANS.length }),
      t("pricingRange", {
        min: formatAmount(cheapest.yearlyPriceTl, locale),
        max: formatAmount(priciest.yearlyPriceTl, locale),
      }),
      t("pricingTrial", { days: siteConfig.billing.trial.durationDays }),
      t("pricingRefund", { days: siteConfig.billing.refundPeriodDays }),
      t("pricingCap", { pct: siteConfig.billing.maxYearlyPriceIncreasePct }),
    ],
    complianceLines: [
      t("complianceCondominium"),
      t("complianceKvkk", {
        days: Math.round(siteConfig.legal.kvkkResponseHours / 24),
      }),
      t("complianceLogs", { days: siteConfig.legal.logRetentionDays }),
    ],
    linkLabels: {
      home: t("linkHome"),
      pricing: t("linkPricing"),
      features: t("linkFeatures"),
      campaigns: t("linkCampaigns"),
      blog: t("linkBlog"),
      app: t("linkApp"),
    },
  };
}
