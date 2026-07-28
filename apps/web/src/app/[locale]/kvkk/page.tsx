import { Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { privacyNotice } from "@yonetim/kvkk";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { extractHeadings, renderMarkdown } from "@/lib/markdown";
import { TableOfContents } from "@/components/blog/table-of-contents";

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
  const tBlog = await getTranslations("marketing.blog");
  const text = privacyNotice(
    {
      tenantName: siteConfig.brand.legalName,
      tenantAddress: siteConfig.brand.contact.address,
      contactEmail: siteConfig.brand.contact.email,
    },
    locale,
  ).replace(/^# .*\n/, "");

  const headings = extractHeadings(text);

  return (
    <>
      <header className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-12">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-subtle">{t("note")}</p>
        </div>
      </header>

      {/*
        Hukuki metinlerde içindekiler cila değil, işlev: ziyaretçi çoğunlukla
        tek bir başlığı ("Haklarınız", "Saklama süreleri") aramaya geliyor.
        Başlık kimlikleri `renderMarkdown` ile aynı fonksiyondan üretiliyor,
        bu yüzden bağlantılar JavaScript olmadan da doğru yere gidiyor.
      */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="mx-auto w-full max-w-[68ch] xl:mx-0">
          {renderMarkdown(text)}

          <p className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-6 text-sm text-fg-muted">
            <Mail aria-hidden className="h-4 w-4 text-fg-subtle" />
            <a
              href={`mailto:${siteConfig.brand.contact.email}`}
              className="font-medium text-primary hover:underline"
            >
              {siteConfig.brand.contact.email}
            </a>
          </p>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <TableOfContents headings={headings} label={tBlog("tocLabel")} />
          </div>
        </aside>
      </div>
    </>
  );
}
