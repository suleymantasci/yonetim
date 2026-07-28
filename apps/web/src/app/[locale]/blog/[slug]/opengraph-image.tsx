import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";

import { getContent } from "@/content";
import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og";

/** Yazı başına paylaşım görseli — kategori üst satırda, başlık ana metinde. */
export const alt = siteConfig.brand.name;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function BlogOpengraphImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const post = getContent(locale).posts.find((item) => item.slug === slug);
  if (!post) notFound();

  const t = await getTranslations({ locale, namespace: "marketing.blog" });

  return renderOgImage({
    eyebrow: t(`category.${post.category}`),
    title: post.title,
    description: post.description,
  });
}
