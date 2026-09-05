import { Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import { formatAmount } from "@yonetim/i18n";
import { BILLING_PERIODS, planForUnitCount, type BillingPeriod } from "@yonetim/pricing";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { BlueprintGrid, BrandWash, Reveal } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";
import { DEFAULT_UNIT_COUNT } from "@/lib/pricing-stops";

import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";
import { PlanCalculator } from "@/components/pricing/plan-calculator";
import { PlanTable } from "@/components/pricing/plan-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.pricing" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/fiyatlandirma", locale as Locale),
    alternatePaths: alternatePaths("/fiyatlandirma"),
  });
}

/** Fiyatlandırma soruları — SSS içeriğinden fiyatla ilgili olanlar seçilir. */
const PRICING_FAQ_INDEXES = [4, 6, 7];

const GUARANTEES = ["guarantee1", "guarantee2", "guarantee3", "guarantee4", "guarantee5", "guarantee6"] as const;

export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ daire?: string; donem?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("marketing.pricing");
  const tCampaign = await getTranslations("marketing.campaigns");
  const tEnumPeriod = await getTranslations("enum.billingPeriod");

  const unitCount = Number(query.daire ?? "") || DEFAULT_UNIT_COUNT;
  const period: BillingPeriod =
    query.donem && query.donem in BILLING_PERIODS ? (query.donem as BillingPeriod) : "yearly";

  const content = getContent(locale);
  const pricingFaqs = PRICING_FAQ_INDEXES.map((i) => content.faqs[i]).filter(
    (f): f is NonNullable<typeof f> => Boolean(f),
  );

  const activeCampaigns = CAMPAIGN_TEMPLATES.filter((c) =>
    ["yeni_site_hosgeldin", "yillik_pesin_indirim", "gecis_kampanyasi"].includes(c.key),
  );

  const guaranteeValues: Record<(typeof GUARANTEES)[number], Record<string, string | number>> = {
    guarantee1: {},
    guarantee2: { days: siteConfig.billing.refundPeriodDays },
    guarantee3: { pct: siteConfig.billing.maxYearlyPriceIncreasePct },
    guarantee4: { price: formatAmount(siteConfig.billing.smsOverageUnitCost, locale) },
    guarantee5: { days: siteConfig.billing.graceDaysAfterExpiry },
    guarantee6: {},
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(pricingFaqs)) }}
      />

      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />

        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-16 text-center">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
            {t.rich("subtitle", richTags)}
          </p>

          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {activeCampaigns.map((c) => (
              <li
                key={c.key}
                className="rounded-full border border-accent-soft bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-soft-fg"
              >
                {c.badge ? `${tCampaign(`badge.${c.badge}`)} · ` : ""}
                {tCampaign(`template.${c.key}.headline`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HESAPLAYICI — sunucuda da render edilir, JS'siz form olarak çalışır. */}
      <section className="mx-auto max-w-4xl px-4 py-12">
        <PlanCalculator
          locale={locale}
          initialUnits={unitCount}
          initialPeriod={period}
          signupUrl={`${siteConfig.env.appUrl}/kayit`}
          periods={(Object.keys(BILLING_PERIODS) as BillingPeriod[]).map((key) => ({
            value: key,
            label: tEnumPeriod(key),
          }))}
          labels={{
            unitCountLabel: t("unitCountLabel"),
            unitCountPlaceholder: t("unitCountPlaceholder"),
            sliderLabel: t("sliderLabel"),
            quickPresetsLabel: t("quickPresetsLabel"),
            unitsSuffix: t("unitsSuffix"),
            periodLabel: t("periodLabel"),
            findPlan: t("findPlan"),
            recommendedFor: t("recommendedFor", { count: "{count}" }),
            installmentCount: t("installmentCount", { count: "{count}" }),
            yearlyTotal: t("yearlyTotal"),
            annualEquivalent: t("annualEquivalent"),
            annualUpfrontHint: t("annualUpfrontHint", { amount: "{amount}", savings: "{savings}" }),
            switchToYearly: t("switchToYearly"),
            surcharge: t("surcharge", { amount: "{amount}" }),
            noSurcharge: t("noSurcharge"),
            annualSavings: t("annualSavings", { amount: "{amount}" }),
            periodSavings: t("periodSavings", { amount: "{amount}" }),
            flexiblePayment: t("flexiblePayment"),
            periodBadges: {
              yearly: t("periodBadgeYearly"),
              semiannual: t("periodBadgeSemiannual"),
              quarterly: t("periodBadgeQuarterly"),
              monthly: t("periodBadgeMonthly"),
            },
            perUnitMonthly: t("perUnitMonthly"),
            smsIncluded: t("smsIncluded", { count: "{count}" }),
            savingsBadge: t("savingsBadge", { pct: "{pct}" }),
            comparePeer: t("comparePeer"),
            compareUs: siteConfig.brand.name,
            compareCaption: t("compareCaption"),
            compareSubtitle: t("compareSubtitle"),
            compareSavingsBadge: t("compareSavingsBadge", { amount: "{amount}", pct: "{pct}" }),
            annualSwitchTip: t("annualSwitchTip", { amount: "{amount}" }),
            ctaTrial: t("ctaTrial"),
            ctaNote: t("ctaNote"),
          }}
        />
      </section>

      {/* TÜM PAKETLER */}
      <section className="bg-surface-sunken py-16">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg">
              {t("plansTitle")}
            </h2>
            <p className="mt-3 max-w-prose text-fg-muted">{t("plansSubtitle")}</p>
          </Reveal>

          <div className="mt-8">
            <PlanTable
              locale={locale}
              highlightedCode={query.daire ? planForUnitCount(unitCount).code : null}
            />
          </div>
        </div>
      </section>

      {/* GARANTİLER */}
      <section className="mx-auto max-w-4xl px-4 py-16">
        <Reveal>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight text-fg">
            {t("guaranteesTitle")}
          </h2>
        </Reveal>
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
          <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
            {GUARANTEES.map((key) => (
              <li
                key={key}
                className="flex gap-3.5 border-b border-border p-5 text-sm text-fg-muted transition-colors hover:bg-hover/40 sm:last:border-b-0"
              >
                <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="leading-relaxed">{t(key, guaranteeValues[key])}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SSS */}
      <section className="mx-auto max-w-3xl px-4 pb-20">
        <Reveal>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight text-fg">
            {t("faqTitle")}
          </h2>
        </Reveal>
        <Accordion className="mt-6">
          {pricingFaqs.map((faq) => (
            <AccordionItem key={faq.question} title={faq.question} name="pricing-faq">
              {faq.answer}
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </>
  );
}
