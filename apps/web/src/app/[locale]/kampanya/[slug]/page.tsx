import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import { formatAmount, LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

function findTemplate(slug: string) {
  return CAMPAIGN_TEMPLATES.find((c) => c.key.replace(/_/g, "-") === slug);
}

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    CAMPAIGN_TEMPLATES.map((c) => ({ locale, slug: c.key.replace(/_/g, "-") })),
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
    const names = k.migratingFrom
      .map((s) => (s === "diger" ? s : tEnum(s as never)))
      .join(", ");
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
  if (conditions.length === 0) conditions.push(t("noExtraConditions"));

  const reward = (() => {
    const r = template.reward;
    switch (r.type) {
      case "free_months":
        return t("reward.freeMonths", { count: r.value });
      case "percent_off":
        return t("reward.percentOff", { value: r.value });
      case "amount_off":
        return t("reward.amountOff", { value: r.value });
      case "free_period":
        return r.value === 1
          ? t("reward.freeFirstYear")
          : t("reward.freeYears", { count: r.value });
      case "credit_balance":
        return t("reward.creditBalance", { value: r.value });
      default:
        return "";
    }
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
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
      {template.badge ? (
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-soft-fg">
          {t(`badge.${template.badge}`)}
        </span>
      ) : null}
      <h1 className="mt-4 font-heading text-4xl font-extrabold">
        {t(`template.${template.key}.name`)}
      </h1>
      <p className="mt-3 text-lg text-fg-muted">{t(`template.${template.key}.headline`)}</p>
      <p className="mt-2 text-sm text-fg-subtle">{t(`template.${template.key}.description`)}</p>

      <div className="mt-8 rounded-lg border border-border p-5">
        <h2 className="font-heading text-lg font-bold">{t("rewardTitle")}</h2>
        <p className="mt-1 text-2xl font-extrabold text-primary">
          {reward}
          {template.reward.lifetime ? ` ${t("reward.lifetime")}` : ""}
        </p>
        {template.reward.maxTotalDiscountTl ? (
          <p className="mt-1 text-sm text-fg-subtle">
            {t("maxDiscount", {
              amount: formatAmount(template.reward.maxTotalDiscountTl, locale),
            })}
          </p>
        ) : null}
      </div>

      <h2 className="mt-8 font-heading text-lg font-bold">{t("conditionsTitle")}</h2>
      <ul className="mt-3 space-y-1.5 text-fg">
        {conditions.map((c) => (
          <li key={c}>• {c}</li>
        ))}
      </ul>

      <h2 className="mt-8 font-heading text-lg font-bold">{t("rulesTitle")}</h2>
      <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
        <li>• {template.stackable ? t("rule.stackable") : t("rule.notStackable")}</li>
        <li>• {t("rule.oncePerTenant")}</li>
        <li>• {t("rule.priceLocked")}</li>
        <li>• {t("rule.fraudCheck")}</li>
      </ul>

      <a
        href={`${siteConfig.env.appUrl}/kayit?kampanya=${template.key}`}
        className="mt-10 inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-primary-fg hover:bg-primary-hover"
      >
        {t("startWithCampaign")}
      </a>
    </div>
  );
}
