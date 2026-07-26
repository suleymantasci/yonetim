import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

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

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.campaigns");
  const tCommon = await getTranslations("common");

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">
        {t.rich("subtitle", richTags)}
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {CAMPAIGN_TEMPLATES.map((c) => (
          <article key={c.key} className="flex flex-col rounded-lg border border-border p-5">
            {c.badge ? (
              <span className="mb-3 w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-soft-fg">
                {t(`badge.${c.badge}`)}
              </span>
            ) : null}
            <h2 className="font-heading text-lg font-bold">{t(`template.${c.key}.name`)}</h2>
            <p className="mt-2 text-sm text-fg-muted">{t(`template.${c.key}.headline`)}</p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-fg-muted">
              {t(`template.${c.key}.bullets`)
                .split("|")
                .map((b) => (
                  <li key={b} className="flex gap-2">
                    <span aria-hidden className="text-success">✓</span>
                    {b}
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Link
                href={{ pathname: "/kampanya/[slug]", params: { slug: c.key.replace(/_/g, "-") } }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("seeConditions")}
              </Link>
              <a
                href={`${siteConfig.env.appUrl}/kayit?kampanya=${c.key}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                {tCommon("action.apply")}
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
