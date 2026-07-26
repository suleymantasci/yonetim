import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { formatDateFor } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { Link } from "@/i18n/navigation";
import { getContent } from "@/content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.blog" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/blog", locale as Locale),
    alternatePaths: alternatePaths("/blog"),
  });
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.blog");
  const content = getContent(locale);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 text-fg-muted">{t("subtitle")}</p>
      <div className="mt-10 space-y-6">
        {content.posts.map((p) => (
          <article key={p.slug} className="rounded-lg border border-border p-5">
            <div className="flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
              <span className="rounded bg-surface-sunken px-2 py-0.5 font-medium">
                {t(`category.${p.category}`)}
              </span>
              <time dateTime={p.publishedAt}>{formatDateFor(new Date(p.publishedAt), locale)}</time>
              <span>{t("readingTime", { minutes: p.readingMinutes })}</span>
            </div>
            <h2 className="mt-2 font-heading text-xl font-bold">
              <Link
                href={{ pathname: "/blog/[slug]", params: { slug: p.slug } }}
                className="transition-colors hover:text-primary"
              >
                {p.title}
              </Link>
            </h2>
            <p className="mt-2 text-sm text-fg-muted">{p.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
