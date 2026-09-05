import { ArrowRight, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { MIGRATION_SOURCES } from "@yonetim/core";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";
import { BlueprintGrid, BrandWash, Reveal, Stagger } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.migration" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/gecis", locale as Locale),
    alternatePaths: alternatePaths("/gecis"),
  });
}

const SOURCE_NOTE_KEY: Record<string, string> = {
  apsiyon: "source.apsiyonNote",
  biyos: "source.biyosNote",
  dijiyon: "source.dijiyonNote",
  yonetimcell: "source.yonetimcellNote",
  excel: "source.excelNote",
};

export default async function MigrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.migration");
  const tEnum = await getTranslations("enum.migrationSource");

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-16">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{t("subtitle")}</p>
        </div>
      </section>

      {/*
        Dört adım sıralı bir süreç; dört eşit kutu bunu anlatmıyordu. Numaralı
        madde işaretleri ve aralarındaki dikey çizgi "önce bu, sonra şu"yu
        bakışta veriyor. Çizgi `aria-hidden` bir sözde-öğe; sıralama bilgisi
        `<ol>` semantiğinden geliyor, çizgiden değil.
      */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <ol className="relative space-y-6 ps-12">
          <span
            aria-hidden
            className="absolute inset-y-4 start-[1.4375rem] w-px bg-border"
          />
          {([1, 2, 3, 4] as const).map((step) => (
            <Reveal
              key={step}
              as="li"
              delay={(step - 1) * 0.06}
              className="relative rounded-2xl border border-border bg-surface p-5"
            >
              <span className="absolute -start-12 top-4 inline-flex h-12 w-12 items-center justify-center">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-fg shadow-xs">
                  {step}
                </span>
              </span>
              <h2 className="font-heading text-lg font-bold text-fg">{t(`step${step}Title`)}</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">{t(`step${step}Body`)}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* KAYNAKLAR */}
      <section className="bg-surface-sunken py-14">
        <div className="mx-auto max-w-4xl px-4">
          <Reveal>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-fg">
              {t("sourcesTitle")}
            </h2>
          </Reveal>

          <Stagger className="mt-6 grid gap-4 sm:grid-cols-2" itemAs="div">
            {MIGRATION_SOURCES.map((source) => (
              <article
                key={source}
                className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5"
              >
                <h3 className="font-heading font-bold text-fg">{tEnum(source)}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg-muted">
                  {t(SOURCE_NOTE_KEY[source]!)}
                </p>
                <a
                  href={`${siteConfig.env.appUrl}/kayit?gecis=${source}`}
                  className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-lg border border-primary px-3.5 py-2 text-sm font-semibold text-primary transition-all duration-150 hover:bg-primary-soft active:scale-[0.98]"
                >
                  {t("importFrom", { name: tEnum(source) })}
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </a>
              </article>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14">
        <Reveal className="flex gap-4 rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-heading text-lg font-bold text-fg">{t("ownershipTitle")}</h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">{t("ownershipBody")}</p>
          </div>
        </Reveal>
      </section>
    </>
  );
}
