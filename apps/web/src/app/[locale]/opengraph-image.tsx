import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";

import { OG_CONTENT_TYPE, OG_SIZE, renderOgImage } from "@/lib/og";

/** Tüm pazarlama sayfalarının varsayılan paylaşım görseli (SPEC Bölüm 10.1). */
export const alt = siteConfig.brand.name;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });

  // Ana sayfada rozet yok: marka adı zaten sol üstteki kilitte duruyor.
  return renderOgImage({
    title: t("brand.tagline"),
    description: t("brand.description"),
  });
}
