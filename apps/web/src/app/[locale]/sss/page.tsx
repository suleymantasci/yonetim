import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.faq" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/sss", locale as Locale),
    alternatePaths: alternatePaths("/sss"),
  });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.faq");
  const content = getContent(locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(content.faqs)) }}
      />
      <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
      <dl className="mt-10 space-y-4">
        {content.faqs.map((f) => (
          <div key={f.question} className="rounded-lg border border-border p-5">
            <dt className="font-heading font-bold">{f.question}</dt>
            <dd className="mt-2 text-fg-muted">{f.answer}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
