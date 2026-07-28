import { ArrowRight, ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { formatDateFor, LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { articleSchema, breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Reveal } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { Link } from "@/i18n/navigation";
import { allPostSlugs, getContent, postBySlug } from "@/content";
import { extractHeadings, renderMarkdown } from "@/lib/markdown";
import { ReadingProgress } from "@/components/blog/reading-progress";
import { TableOfContents } from "@/components/blog/table-of-contents";

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => allPostSlugs().map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = postBySlug(locale, slug);
  if (!post) return {};
  return pageMeta({
    title: post.title,
    description: post.description,
    locale: locale as Locale,
    path: localizedPath("/blog/[slug]", locale as Locale, { slug: post.slug }),
    alternatePaths: alternatePaths("/blog/[slug]", { slug: post.slug }),
    keywords: post.keywords,
    publishedTime: post.publishedAt,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const post = postBySlug(locale, slug);
  if (!post) notFound();

  const t = await getTranslations("marketing.blog");
  const headings = extractHeadings(post.body);

  // İlgili yazılar önce aynı kategoriden; yetmezse en yeni diğerleriyle tamamlanır.
  const others = getContent(locale).posts.filter((p) => p.slug !== post.slug);
  const related = [
    ...others.filter((p) => p.category === post.category),
    ...others.filter((p) => p.category !== post.category),
  ].slice(0, 3);

  return (
    <>
      <ReadingProgress />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            articleSchema({
              title: post.title,
              description: post.description,
              slug: post.slug,
              publishedAt: post.publishedAt,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbSchema([
              { name: siteConfig.brand.name, url: siteConfig.env.baseUrl },
              { name: t("title"), url: `${siteConfig.env.baseUrl}/blog` },
              { name: post.title, url: `${siteConfig.env.baseUrl}/blog/${post.slug}` },
            ]),
          ),
        }}
      />

      <header className="border-b border-border bg-surface-sunken">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronLeft aria-hidden className="h-4 w-4 rtl:rotate-180" />
            {t("title")}
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
            <span className="rounded-full bg-primary-soft px-2.5 py-0.5 font-semibold text-primary-soft-fg">
              {t(`category.${post.category}`)}
            </span>
            <time dateTime={post.publishedAt}>
              {formatDateFor(new Date(post.publishedAt), locale)}
            </time>
            <span>{t("readingTime", { minutes: post.readingMinutes })}</span>
          </div>

          {/* Ölçü 22ch–26ch arasında tutuluyor: uzun başlıklar üç satırı geçmesin. */}
          <h1 className="mt-4 max-w-[24ch] font-heading text-4xl font-extrabold leading-[1.12] tracking-tight text-fg sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{post.description}</p>
        </div>
      </header>

      {/*
        Yazı ve içindekiler yan yana. İçindekiler `xl` altında gizli: dar
        ekranda yapışkan bir sütun metnin ölçüsünü okunmaz hâle getiriyordu,
        başlıkların üstüne katlanan bir liste de yazının başını itiyordu.
      */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="mx-auto w-full max-w-[68ch] xl:mx-0">
          {renderMarkdown(post.body)}

          {post.keywords.length > 0 ? (
            <ul className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
              {post.keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-fg-subtle"
                >
                  {keyword}
                </li>
              ))}
            </ul>
          ) : null}

          <Reveal
            as="section"
            className="mt-10 rounded-2xl border border-border bg-surface-sunken p-6"
          >
            <h2 className="font-heading text-lg font-bold text-fg">{t("ctaTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t("ctaBody")}</p>
            <a
              href={`${siteConfig.env.appUrl}/kayit`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {t("ctaButton")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
          </Reveal>
        </article>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <TableOfContents headings={headings} label={t("tocLabel")} />
          </div>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="border-t border-border bg-surface-sunken py-14">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-fg">
              {t("relatedTitle")}
            </h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <article className="h-full rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft">
                    <div className="flex items-center gap-2 text-xs text-fg-subtle">
                      <span className="rounded bg-surface-sunken px-2 py-0.5 font-medium">
                        {t(`category.${item.category}`)}
                      </span>
                      <span>{t("readingTime", { minutes: item.readingMinutes })}</span>
                    </div>
                    <h3 className="mt-2 font-heading font-bold text-fg">
                      <Link
                        href={{ pathname: "/blog/[slug]", params: { slug: item.slug } }}
                        className="transition-colors hover:text-primary"
                      >
                        {item.title}
                      </Link>
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-fg-muted">{item.description}</p>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
