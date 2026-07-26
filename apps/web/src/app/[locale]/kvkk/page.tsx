import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { privacyNotice } from "@yonetim/kvkk";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { renderMarkdown } from "@/lib/markdown";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.kvkkPage" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/kvkk", locale as Locale),
    alternatePaths: alternatePaths("/kvkk"),
  });
}

export default async function KvkkPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.kvkkPage");
  const text = privacyNotice(
    {
      tenantName: siteConfig.brand.legalName,
      tenantAddress: siteConfig.brand.contact.address,
      contactEmail: siteConfig.brand.contact.email,
    },
    locale,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="font-heading text-3xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 text-sm text-fg-subtle">{t("note")}</p>
      <div className="mt-8">{renderMarkdown(text.replace(/^# .*\n/, ""))}</div>
    </div>
  );
}
