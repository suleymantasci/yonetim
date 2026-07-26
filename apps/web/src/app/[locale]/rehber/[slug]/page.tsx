import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { allGuideSlugs, guideBySlug } from "@/content";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => allGuideSlugs().map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = guideBySlug(locale, slug);
  if (!guide) return {};
  return pageMeta({
    title: guide.title,
    description: guide.summary,
    locale: locale as Locale,
    path: localizedPath("/rehber/[slug]", locale as Locale, { slug: guide.slug }),
    alternatePaths: alternatePaths("/rehber/[slug]", { slug: guide.slug }),
    keywords: guide.keywords,
  });
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const guide = guideBySlug(locale, slug);
  if (!guide) notFound();

  const t = await getTranslations("marketing.guide");

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            faqSchema(guide.sections.map((s) => ({ question: s.heading, answer: s.body }))),
          ),
        }}
      />
      <h1 className="font-heading text-4xl font-extrabold leading-tight">{guide.title}</h1>
      <p className="mt-3 text-lg text-fg-muted">{guide.summary}</p>

      <div className="mt-10 space-y-8">
        {guide.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-heading text-xl font-bold">{s.heading}</h2>
            <p className="mt-2 leading-relaxed text-fg">{s.body}</p>
          </section>
        ))}
      </div>

      <aside className="mt-12 rounded-lg border border-border bg-surface-sunken p-5">
        <p className="text-sm text-fg-muted">{t("ctaBody", { brand: siteConfig.brand.name })}</p>
        <a
          href={`${siteConfig.env.appUrl}/kayit`}
          className="mt-3 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          {t("ctaAction")}
        </a>
      </aside>
    </div>
  );
}
