import { Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";
import { MODULE_KEYS, type ModuleKey } from "@/components/module-list";
import { DuesExcerpt } from "@/components/features/dues-excerpt";
import { ComparisonTable } from "@/components/features/comparison-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.features" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/ozellikler", locale as Locale),
    alternatePaths: alternatePaths("/ozellikler"),
  });
}

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.features");
  const tModule = await getTranslations("marketing.module");
  const content = getContent(locale);
  // Keep every existing detailed feature and its deep link inside one module directory.
  const detailsByModule: Record<ModuleKey, number[]> = {
    dues: [2, 4], collection: [1, 7], finance: [3], communication: [0],
    decision: [], maintenance: [5], operations: [9], compliance: [6, 8],
  };

  return (
    <>
      <section className="reference-heading relative isolate overflow-hidden border-b border-border">
        <div className="marketing-container relative pb-12 pt-16">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title").split(",")[0]}, <em className="font-normal">{t("title").split(",").slice(1).join(",")}</em>
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{t("subtitle")}</p>
        </div>
      </section>

      <section className="marketing-container feature-directory grid lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={t("moduleListTitle")} className="hidden border-e border-border py-8 pe-8 lg:block">
          <ol className="sticky top-24 space-y-5">
            {MODULE_KEYS.map((key, index) => (
              <li key={key}>
                <a href={`#module-${key}`} className="block text-sm text-fg-muted hover:text-primary">
                  <span className="mb-2 block text-xs tabular-nums text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>
                  {tModule(`${key}Title`)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 lg:ps-10">
          {MODULE_KEYS.map((key, index) => (
            <article key={key} id={`module-${key}`} className="scroll-mt-24 border-b border-border py-10">
              <h2>{tModule(`${key}Title`)}</h2>
              <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-base leading-relaxed text-fg-muted">
                {tModule(`${key}Items`).split("|").map(item => (
                  <li key={item} className="flex max-w-prose gap-2">
                    <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{item}</span>
                  </li>
                ))}
              </ul>
              {index === 0 ? <DuesExcerpt locale={locale} /> : null}
              {detailsByModule[key].map(detailIndex => {
                const feature = content.killerFeatures[detailIndex];
                if (!feature) return null;
                return (
                  <div key={feature.slug} id={feature.slug} className="feature-detail mt-8 scroll-mt-24 border-t border-border pt-7">
                    <h3 className="text-fg">{feature.title}</h3>
                    <p className="mt-3 max-w-prose leading-relaxed text-fg">{feature.description}</p>
                    <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">{feature.detail}</p>
                    <p className="mt-3 text-xs text-fg-subtle">{t("specSection", { ref: feature.specRef })}</p>
                  </div>
                );
              })}
            </article>
          ))}
          <section className="py-10" aria-labelledby="feature-comparison">
            <h2 id="feature-comparison">{t("comparisonTitle")}</h2>
            <p className="mt-3 max-w-prose text-sm text-fg-subtle">{t("comparisonDisclaimer")}</p>
            <div className="mt-8">
              <ComparisonTable rows={content.comparison} labels={{
                feature: t("comparisonFeature"), us: t("comparisonUs"), partial: t("partial"),
                soon: t("soon"), yes: t("yes"), no: t("no"), caption: t("comparisonTitle"),
              }} />
            </div>
          </section>
        </div>
      </section>
    </>
  );
}
