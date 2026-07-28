import { ArrowRight, Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";
import { BlueprintGrid, BrandWash, Reveal, Stagger } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";
import { campaignSlug, rewardLabel } from "@/lib/campaign-reward";

import { Link } from "@/i18n/navigation";
import { richTags } from "@/components/rich-text";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.campaigns" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/kampanyalar", locale as Locale),
    alternatePaths: alternatePaths("/kampanyalar"),
  });
}

/** Süzgeç seçenekleri — `CAMPAIGN_TEMPLATES` içinde fiilen geçen kitleler. */
const SEGMENTS = [
  "new_signup",
  "site_manager",
  "mgmt_company",
  "migrating",
  "existing_customer",
] as const;

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kime?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("marketing.campaigns");
  const tCommon = await getTranslations("common");

  /*
    Süzgeç bir bağlantı listesi: durum URL'de kalıyor, paylaşılabiliyor,
    sunucuda süzülüyor ve JavaScript gerektirmiyor. On bir kampanyada
    "bu bana mı?" sorusunu en hızlı kapatan şey bu.
  */
  const active = SEGMENTS.find((segment) => segment === query.kime) ?? null;
  const templates = active
    ? CAMPAIGN_TEMPLATES.filter((c) => c.audience.segments.includes(active as never))
    : CAMPAIGN_TEMPLATES;

  const chip = (isActive: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors " +
    (isActive
      ? "border-primary bg-primary text-primary-fg"
      : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg");

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-16">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
            {t.rich("subtitle", richTags)}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <nav aria-label={t("filterLabel")}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href="/kampanyalar"
                aria-current={active ? undefined : "page"}
                className={chip(!active)}
              >
                {t("filterAll")}
              </Link>
            </li>
            {SEGMENTS.map((segment) => (
              <li key={segment}>
                <Link
                  href={{ pathname: "/kampanyalar", query: { kime: segment } }}
                  aria-current={active === segment ? "page" : undefined}
                  className={chip(active === segment)}
                >
                  {t(`segment.${segment}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Stagger className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3" itemAs="div">
          {templates.map((template) => (
            <article
              key={template.key}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft"
            >
              <div className="flex items-start justify-between gap-2">
                {/*
                  Ödül kartın en büyük öğesi. Kampanya adı ("Erken Kuş")
                  ziyaretçiye hiçbir şey söylemiyor; "%25 indirim" söylüyor.
                */}
                <p className="font-heading text-2xl font-extrabold leading-tight text-primary">
                  {rewardLabel(template, t)}
                </p>
                {template.badge ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent-soft-fg">
                    {t(`badge.${template.badge}`)}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-3 font-heading text-base font-bold text-fg">
                {t(`template.${template.key}.name`)}
              </h2>
              <p className="mt-1.5 text-sm text-fg-muted">
                {t(`template.${template.key}.headline`)}
              </p>

              <ul className="mt-4 flex-1 space-y-2 text-sm text-fg-muted">
                {t(`template.${template.key}.bullets`)
                  .split("|")
                  .map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{bullet}</span>
                    </li>
                  ))}
              </ul>

              <ul className="mt-4 flex flex-wrap gap-1.5">
                {template.audience.segments.map((segment) => (
                  <li
                    key={segment}
                    className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-fg-subtle"
                  >
                    {t(`segment.${segment}`)}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
                <Link
                  href={{
                    pathname: "/kampanya/[slug]",
                    params: { slug: campaignSlug(template.key) },
                  }}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  {t("seeConditions")}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
                <a
                  href={`${siteConfig.env.appUrl}/kayit?kampanya=${template.key}`}
                  className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
                >
                  {tCommon("action.apply")}
                </a>
              </div>
            </article>
          ))}
        </Stagger>

        {templates.length === 0 ? (
          <Reveal className="mt-8 rounded-2xl border border-border bg-surface-sunken p-8 text-center">
            <p className="text-fg-muted">{t("filterEmpty")}</p>
          </Reveal>
        ) : null}
      </section>
    </>
  );
}
