import { ArrowRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { formatDateFor } from "@yonetim/i18n";
import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";
import { GradientMesh, Reveal, Stagger } from "@yonetim/ui/motion";

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

const CATEGORIES = ["rehber", "mevzuat", "urun"] as const;

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kategori?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const query = await searchParams;
  const t = await getTranslations("marketing.blog");
  const content = getContent(locale);

  const active = CATEGORIES.find((category) => category === query.kategori) ?? null;
  const posts = active ? content.posts.filter((p) => p.category === active) : content.posts;

  // Öne çıkan yazı yalnız süzgeçsiz görünümde: süzülmüş bir listede "öne
  // çıkan" ile "ilk sonuç" aynı şey olur, ikisini ayrı göstermek yanıltıcı.
  const featured = active ? null : (posts[0] ?? null);
  const rest = featured ? posts.slice(1) : posts;

  const chip = (isActive: boolean) =>
    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors " +
    (isActive
      ? "border-primary bg-primary text-primary-fg"
      : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg");

  const meta = (post: NonNullable<typeof featured>) => (
    <div className="flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 font-semibold text-primary-soft-fg">
        {t(`category.${post.category}`)}
      </span>
      <time dateTime={post.publishedAt}>{formatDateFor(new Date(post.publishedAt), locale)}</time>
      <span>{t("readingTime", { minutes: post.readingMinutes })}</span>
    </div>
  );

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border">
        <GradientMesh />
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-16">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">{t("subtitle")}</p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12">
        <nav aria-label={t("filterLabel")}>
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link href="/blog" aria-current={active ? undefined : "page"} className={chip(!active)}>
                {t("filterAll")}
              </Link>
            </li>
            {CATEGORIES.map((category) => (
              <li key={category}>
                <Link
                  href={{ pathname: "/blog", query: { kategori: category } }}
                  aria-current={active === category ? "page" : undefined}
                  className={chip(active === category)}
                >
                  {t(`category.${category}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {featured ? (
          <Reveal
            as="article"
            className="mt-8 rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-primary-soft sm:p-8"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {t("featuredLabel")}
            </p>
            <h2 className="mt-3 font-heading text-2xl font-extrabold leading-tight text-fg sm:text-3xl">
              <Link
                href={{ pathname: "/blog/[slug]", params: { slug: featured.slug } }}
                className="transition-colors hover:text-primary"
              >
                {featured.title}
              </Link>
            </h2>
            <p className="mt-3 max-w-2xl leading-relaxed text-fg-muted">{featured.description}</p>
            <div className="mt-4">{meta(featured)}</div>
            <Link
              href={{ pathname: "/blog/[slug]", params: { slug: featured.slug } }}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              tabIndex={-1}
              aria-hidden
            >
              {t("readMore")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </Reveal>
        ) : null}

        <Stagger className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3" itemAs="div">
          {rest.map((post) => (
            <article
              key={post.slug}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft"
            >
              {meta(post)}
              <h2 className="mt-3 font-heading text-lg font-bold leading-snug text-fg">
                <Link
                  href={{ pathname: "/blog/[slug]", params: { slug: post.slug } }}
                  className="transition-colors hover:text-primary"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">
                {post.description}
              </p>
            </article>
          ))}
        </Stagger>

        {posts.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-border bg-surface-sunken p-8 text-center text-fg-muted">
            {t("filterEmpty")}
          </p>
        ) : null}
      </div>
    </>
  );
}
