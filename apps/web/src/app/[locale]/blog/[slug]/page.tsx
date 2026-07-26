import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import { formatDateFor, LOCALES } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { articleSchema, breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { Link } from "@/i18n/navigation";
import { allPostSlugs, getContent, postBySlug } from "@/content";
import { renderMarkdown } from "@/lib/markdown";

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
  const related = getContent(locale).posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
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

      <div className="text-xs text-fg-subtle">
        <time dateTime={post.publishedAt}>{formatDateFor(new Date(post.publishedAt), locale)}</time>
        {" · "}
        {t("readingTime", { minutes: post.readingMinutes })}
      </div>
      <h1 className="mt-3 font-heading text-4xl font-extrabold leading-tight">{post.title}</h1>
      <p className="mt-3 text-lg text-fg-muted">{post.description}</p>

      <div className="mt-8">{renderMarkdown(post.body)}</div>

      <aside className="mt-12 rounded-lg border border-border bg-surface-sunken p-5">
        <h2 className="font-heading font-bold">{t("ctaTitle")}</h2>
        <p className="mt-2 text-sm text-fg-muted">{t("ctaBody")}</p>
        <a
          href={`${siteConfig.env.appUrl}/kayit`}
          className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          {t("ctaTitle")}
        </a>
      </aside>

      <nav className="mt-12">
        <h2 className="font-heading text-lg font-bold">{t("relatedTitle")}</h2>
        <ul className="mt-3 space-y-2">
          {related.map((r) => (
            <li key={r.slug}>
              <Link
                href={{ pathname: "/blog/[slug]", params: { slug: r.slug } }}
                className="text-primary hover:underline"
              >
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
