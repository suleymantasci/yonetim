import { ArrowRight, ChevronLeft, Check, Info } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import { formatAmount, LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Reveal } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";
import { campaignSlug, rewardLabel } from "@/lib/campaign-reward";

import { Link } from "@/i18n/navigation";

function findTemplate(slug: string) {
  return CAMPAIGN_TEMPLATES.find((c) => campaignSlug(c.key) === slug);
}

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    CAMPAIGN_TEMPLATES.map((c) => ({ locale, slug: campaignSlug(c.key) })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const template = findTemplate(slug);
  if (!template) return {};
  const t = await getTranslations({ locale, namespace: "marketing.campaigns" });
  return pageMeta({
    title: t(`template.${template.key}.name`),
    description: t(`template.${template.key}.headline`),
    locale: locale as Locale,
    path: localizedPath("/kampanya/[slug]", locale as Locale, { slug }),
    alternatePaths: alternatePaths("/kampanya/[slug]", { slug }),
  });
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const template = findTemplate(slug);
  if (!template) notFound();

  const t = await getTranslations("marketing.campaigns");
  const tEnum = await getTranslations("enum.migrationSource");
  const k = template.conditions;

  const conditions: string[] = [];
  if (k.commitsToYears) conditions.push(t("condition.commitYears", { years: k.commitsToYears }));
  if (k.minUnitCount) conditions.push(t("condition.minUnits", { count: k.minUnitCount }));
  if (k.maxUnitCount) conditions.push(t("condition.maxUnits", { count: k.maxUnitCount }));
  if (k.minPeriod === "yearly") conditions.push(t("condition.yearlyUpfront"));
  if (k.migratingFrom?.length) {
    // `diger` artık `enum.migrationSource` içinde; önce çevirisi olmadığı için
    // ham anahtar ("diger") metnin içine sızıyordu.
    const names = k.migratingFrom.map((s) => tEnum(s as never)).join(", ");
    conditions.push(t("condition.migratingFrom", { sources: names }));
  }
  if (k.remainingContractMonths?.max) {
    conditions.push(t("condition.remainingContract", { months: k.remainingContractMonths.max }));
  }
  if (k.referralCountRequired) {
    conditions.push(t("condition.referrals", { count: k.referralCountRequired }));
  }
  if (k.hasPartnerContract?.length) conditions.push(t("condition.partnerContract"));
  if (k.firstNTenants) conditions.push(t("condition.firstN", { count: k.firstNTenants }));
  if (k.requiresPromoCode) conditions.push(t("condition.promoCode"));

  const noConditions = conditions.length === 0;
  if (noConditions) conditions.push(t("noExtraConditions"));

  const rules = [
    template.stackable ? t("rule.stackable") : t("rule.notStackable"),
    t("rule.oncePerTenant"),
    t("rule.priceLocked"),
    t("rule.fraudCheck"),
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbSchema([
              { name: siteConfig.brand.name, url: siteConfig.env.baseUrl },
              { name: t("title"), url: `${siteConfig.env.baseUrl}/kampanyalar` },
              {
                name: t(`template.${template.key}.name`),
                url: `${siteConfig.env.baseUrl}/kampanya/${slug}`,
              },
            ]),
          ),
        }}
      />

      {/*
        Görünür kırıntı yolu: yapısal veri zaten vardı ama sayfada yoktu.
        Kampanya sayfalarına çoğunlukla doğrudan bağlantıyla giriliyor;
        geri dönüş yolu olmadan ziyaretçi listeye ulaşamıyordu.
      */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div className="marketing-container relative pb-12 pt-10">
          <Link
            href="/kampanyalar"
            className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
            {t("title")}
          </Link>

          {/* `block w-fit`: satır içi bir öğede `mt-6` aynı satırda kalıp
              kırıntı yolunun yanına yapışıyordu. */}
          {template.badge ? (
            <span className="mt-6 block w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-soft-fg">
              {t(`badge.${template.badge}`)}
            </span>
          ) : null}

          <h1 className="mt-4 font-heading text-4xl font-extrabold tracking-tight text-fg">
            {t(`template.${template.key}.name`)}
          </h1>
          <p className="mt-3 text-lg text-fg-muted">{t(`template.${template.key}.headline`)}</p>
          <p className="mt-2 text-sm leading-relaxed text-fg-subtle">
            {t(`template.${template.key}.description`)}
          </p>

          <ul className="mt-5 flex flex-wrap gap-1.5">
            {template.audience.segments.map((segment) => (
              <li
                key={segment}
                className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-muted"
              >
                {t(`segment.${segment}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="marketing-container py-12">
        {/* ÖDÜL — sayfadaki tek en büyük rakam. */}
        <Reveal className="rounded-2xl border-2 border-primary bg-primary-soft p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-primary-soft-fg">
            {t("rewardTitle")}
          </h2>
          <p className="mt-2 font-heading text-4xl font-extrabold leading-tight text-primary-soft-fg">
            {rewardLabel(template, t)}
          </p>
          {template.reward.maxTotalDiscountTl ? (
            <p className="mt-2 text-sm text-primary-soft-fg opacity-80">
              {t("maxDiscount", {
                amount: formatAmount(template.reward.maxTotalDiscountTl, locale),
              })}
            </p>
          ) : null}
        </Reveal>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Reveal as="section" className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-heading text-lg font-bold text-fg">{t("conditionsTitle")}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-fg">
              {conditions.map((condition) => (
                <li key={condition} className="flex gap-2.5">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{condition}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal as="section" delay={0.05} className="rounded-2xl border border-border bg-surface-sunken p-6">
            <h2 className="font-heading text-lg font-bold text-fg">{t("rulesTitle")}</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-fg-muted">
              {rules.map((rule) => (
                <li key={rule} className="flex gap-2.5">
                  <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a
            href={`${siteConfig.env.appUrl}/kayit?kampanya=${template.key}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-fg shadow-md transition-all duration-150 hover:bg-primary-hover hover:shadow-lg active:scale-[0.98]"
          >
            {t("startWithCampaign")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </a>
          <Link
            href="/fiyatlandirma"
            className="inline-flex items-center rounded-xl border border-border-strong px-6 py-3.5 font-semibold text-fg shadow-sm transition-all duration-150 hover:border-fg/50 hover:bg-hover active:scale-[0.98]"
          >
            {t("seePricing")}
          </Link>
        </div>
      </div>
    </>
  );
}
