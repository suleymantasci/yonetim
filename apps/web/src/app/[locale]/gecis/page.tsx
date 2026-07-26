import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { MIGRATION_SOURCES } from "@yonetim/core";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

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
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">{t("subtitle")}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {([1, 2, 3, 4] as const).map((i) => (
          <div key={i} className="rounded-lg border border-border p-5">
            <h2 className="font-heading font-bold">{t(`step${i}Title`)}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t(`step${i}Body`)}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 font-heading text-2xl font-extrabold">{t("sourcesTitle")}</h2>
      <ul className="mt-4 space-y-3">
        {MIGRATION_SOURCES.map((source) => (
          <li
            key={source}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-4"
          >
            <div>
              <div className="font-semibold text-fg">{tEnum(source)}</div>
              <div className="text-sm text-fg-subtle">{t(SOURCE_NOTE_KEY[source]!)}</div>
            </div>
            <a
              href={`${siteConfig.env.appUrl}/kayit?gecis=${source}`}
              className="rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft"
            >
              {t("importFrom", { name: tEnum(source) })}
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-12 rounded-lg border border-warning-border bg-warning-soft p-5 text-warning-fg">
        <h2 className="font-heading font-bold">{t("ownershipTitle")}</h2>
        <p className="mt-2 text-sm">{t("ownershipBody")}</p>
      </div>
    </div>
  );
}
