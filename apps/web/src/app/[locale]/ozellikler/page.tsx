import { Check } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";
import { BlueprintGrid, BrandWash, Reveal, Stagger } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";
import { MODULE_KEYS } from "@/components/module-list";
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

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />
        <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-16">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{t("subtitle")}</p>
        </div>
      </section>

      {/*
        İki sütun: solda yapışkan dizin, sağda bölümler. On başlıklı bir sayfada
        okuyucunun nerede olduğunu ve neyin kaldığını görmesi, uzun bir listeyi
        kaydırmaktan çok daha hızlı. Dizin `lg` altında gizleniyor — dar ekranda
        yapışkan bir sütun içeriğin yarısını yiyordu.
      */}
      <section className="mx-auto max-w-6xl gap-10 px-4 py-14 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t("indexLabel")} className="hidden lg:block">
          <ol className="sticky top-24 space-y-1 border-s border-border ps-4 text-sm">
            {content.killerFeatures.map((feature, index) => (
              <li key={feature.slug}>
                <a
                  href={`#${feature.slug}`}
                  className="block rounded px-2 py-1.5 text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  <span className="me-2 tabular-nums text-fg-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {feature.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-8">
          {content.killerFeatures.map((feature, index) => (
            <Reveal
              key={feature.slug}
              as="article"
              delay={Math.min(index, 3) * 0.05}
              className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-border-strong sm:p-7"
            >
              {/* Kimlik `article` üzerinde değil başlıkta: bağlantı başlığa götürür. */}
              <div className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className="font-heading text-sm font-bold tabular-nums text-primary"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 id={feature.slug} className="font-heading text-2xl font-bold text-fg">
                  {feature.title}
                </h2>
              </div>
              <p className="mt-3 text-fg">{feature.description}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{feature.detail}</p>
              <span className="mt-4 inline-block rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-fg-subtle">
                {t("specSection", { ref: feature.specRef })}
              </span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* MODÜL LİSTESİ */}
      <section className="border-y border-border bg-surface-sunken py-16">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg">
              {t("moduleListTitle")}
            </h2>
          </Reveal>
          <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" itemAs="div">
            {MODULE_KEYS.map((key) => (
              <article key={key} className="h-full rounded-2xl border border-border bg-surface p-5">
                <h3 className="font-heading font-bold text-fg">{tModule(`${key}Title`)}</h3>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                  {tModule(`${key}Items`)
                    .split("|")
                    .map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                </ul>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      {/* KARŞILAŞTIRMA */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg">
            {t("comparisonTitle")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-fg-subtle">{t("comparisonDisclaimer")}</p>
        </Reveal>

        <div className="mt-8">
          <ComparisonTable
            rows={content.comparison}
            labels={{
              feature: t("comparisonFeature"),
              us: t("comparisonUs"),
              partial: t("partial"),
              soon: t("soon"),
              yes: t("yes"),
              no: t("no"),
              caption: t("comparisonTitle"),
            }}
          />
        </div>
      </section>
    </>
  );
}
