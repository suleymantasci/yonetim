import { getTranslations, setRequestLocale } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { formatAmount, type Locale } from "@yonetim/i18n";
import { STANDARD_PLANS, savingsVsCompetitorPct } from "@yonetim/pricing";
import { faqSchema, jsonLdScript, softwareApplicationSchema } from "@yonetim/seo";

import { Link } from "@/i18n/navigation";
import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";
import { MODULE_KEYS } from "@/components/module-list";

/** JSON-LD `featureList` anahtarları — metinler `marketing.home.schemaFeature.*`. */
const SCHEMA_FEATURES = [
  "dues", "payment", "bot", "expense", "maintenance", "meeting", "kvkk", "legal",
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.home");
  const tAction = await getTranslations("common.action");
  const tCommon = await getTranslations("common");
  const tModule = await getTranslations("marketing.module");
  const content = getContent(locale);

  const cheapest = STANDARD_PLANS[0]!;
  const savings = savingsVsCompetitorPct(cheapest) ?? 50;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            softwareApplicationSchema({
              lowestPriceTl: cheapest.yearlyPriceTl,
              description: tCommon("brand.description"),
              featureList: SCHEMA_FEATURES.map((key) => t(`schemaFeature.${key}`)),
              locale: locale as Locale,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(content.faqs.slice(0, 6))) }}
      />

      <section className="border-b border-border bg-gradient-to-b from-primary-soft to-canvas px-4 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary-soft-fg">
            {t("trialBadge")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-5xl">
            {t("heroTitle")} <span className="text-primary">{t("heroTitleAccent")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-fg-muted">
            {t.rich("heroSubtitle", richTags)}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`${siteConfig.env.appUrl}/kayit`}
              className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-fg hover:bg-primary-hover"
            >
              {t("ctaPrimary")}
            </a>
            <Link
              href="/fiyatlandirma"
              className="rounded-lg border border-border-strong px-6 py-3 font-semibold text-fg hover:bg-hover"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
          <p className="mt-4 text-sm text-fg-subtle">
            {t.rich("priceNote", {
              ...richTags,
              savings,
              price: formatAmount(cheapest.yearlyPriceTl, locale),
            })}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {([1, 2, 3] as const).map((i) => (
            <div key={i} className="rounded-lg border border-border p-6">
              <h2 className="font-heading text-lg font-bold">{t(`problem${i}Title`)}</h2>
              <p className="mt-2 text-sm text-fg-muted">{t(`problem${i}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface-sunken px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-heading text-3xl font-extrabold">{t("killerTitle")}</h2>
          <p className="mt-2 max-w-2xl text-fg-muted">{t("killerSubtitle")}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {content.killerFeatures.map((f) => (
              <article key={f.slug} className="rounded-lg border border-border bg-surface p-5">
                <h3 className="font-heading text-base font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{f.description}</p>
                <Link
                  href="/ozellikler"
                  className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                >
                  {tAction("detail")} →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-heading text-3xl font-extrabold">{t("modulesTitle")}</h2>
        <p className="mt-2 text-fg-muted">{t("modulesSubtitle")}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {MODULE_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-border p-5">
              <h3 className="font-heading font-bold">{tModule(`${key}Title`)}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
                {tModule(`${key}Items`)
                  .split("|")
                  .map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="text-success">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary px-4 py-16 text-primary-fg">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl font-extrabold">{t("ctaTitle")}</h2>
          <p className="mt-3 opacity-90">{t("ctaBody")}</p>
          <a
            href={`${siteConfig.env.appUrl}/kayit`}
            className="mt-6 inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-accent-fg hover:bg-accent-hover"
          >
            {t("ctaPrimary")}
          </a>
        </div>
      </section>
    </>
  );
}
