import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Reveal } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { allGuideSlugs, guideBySlug } from "@/content";
import { slugifyHeading } from "@/lib/markdown";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { TableOfContents } from "@/components/blog/table-of-contents";

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
  const tBlog = await getTranslations("marketing.blog");

  // Başlık kimlikleri `slugifyHeading` ile üretiliyor — blog yazılarıyla aynı
  // fonksiyon, dolayısıyla iki sayfa türünde derin bağlantılar aynı kurala uyuyor.
  const headings = guide.sections.map((section) => ({
    id: slugifyHeading(section.heading),
    text: section.heading,
    level: 2 as const,
  }));

  return (
    <>
      <ReadingProgress />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            faqSchema(guide.sections.map((s) => ({ question: s.heading, answer: s.body }))),
          ),
        }}
      />

      <header className="border-b border-border bg-surface-sunken">
        <div className="marketing-container pb-10 pt-12">
          <h1 className="max-w-[24ch] font-heading text-4xl font-extrabold leading-[1.12] tracking-tight text-fg sm:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{guide.summary}</p>
        </div>
      </header>

      <div className="marketing-container grid gap-10 py-12 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="mx-auto w-full max-w-[68ch] xl:mx-0">
          {guide.sections.map((section, index) => (
            <section key={section.heading}>
              <h2
                id={slugifyHeading(section.heading)}
                className={
                  "scroll-mt-24 font-heading text-2xl font-extrabold tracking-tight text-fg " +
                  (index === 0 ? "" : "mt-12 border-t border-border pt-8")
                }
              >
                {section.heading}
              </h2>
              <p className="mt-5 text-[1.0625rem] leading-[1.75] text-fg">{section.body}</p>
            </section>
          ))}

          <Reveal
            as="section"
            className="mt-12 rounded-2xl border border-border bg-surface-sunken p-6"
          >
            <p className="text-sm leading-relaxed text-fg-muted">
              {t("ctaBody", { brand: siteConfig.brand.name })}
            </p>
            <a
              href={`${siteConfig.env.appUrl}/kayit`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {t("ctaAction")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          </Reveal>
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <TableOfContents headings={headings} label={tBlog("tocLabel")} />
          </div>
        </aside>
      </div>
    </>
  );
}
