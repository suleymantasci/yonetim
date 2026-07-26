import type { MetadataRoute } from "next";

import { CAMPAIGN_TEMPLATES } from "@yonetim/campaigns";
import { siteConfig } from "@yonetim/config";
import { LOCALES } from "@yonetim/i18n";

import { allGuideSlugs, allPostSlugs } from "@/content";
import { alternatePaths, type RouteKey } from "@/lib/paths";

/**
 * Çok dilli sitemap — SPEC Bölüm 10.1 / 21.2.
 *
 * Adresler `routing.pathnames`'ten türetilir (bkz. `@/lib/paths`), böylece
 * çevrilmiş yollar sitemap ile `<head>`'deki `hreflang` etiketleri arasında
 * asla ayrışmaz. Her giriş `alternates.languages` taşır; Google iki dili
 * birbirinin karşılığı olarak eşler. Varsayılan dil öneksizdir.
 */
const BASE = siteConfig.env.baseUrl;

type Frequency = "daily" | "weekly" | "monthly" | "yearly";

interface RouteMeta {
  priority: number;
  changeFrequency: Frequency;
}

const ROUTES: Record<string, RouteMeta> = {
  "/": { priority: 1, changeFrequency: "weekly" },
  "/ozellikler": { priority: 0.9, changeFrequency: "weekly" },
  "/fiyatlandirma": { priority: 0.9, changeFrequency: "weekly" },
  "/kampanyalar": { priority: 0.8, changeFrequency: "daily" },
  "/gecis": { priority: 0.8, changeFrequency: "monthly" },
  "/blog": { priority: 0.7, changeFrequency: "weekly" },
  "/sss": { priority: 0.7, changeFrequency: "monthly" },
  "/kvkk": { priority: 0.4, changeFrequency: "yearly" },
};

const ARTICLE: RouteMeta = { priority: 0.7, changeFrequency: "weekly" };
const CAMPAIGN: RouteMeta = { priority: 0.8, changeFrequency: "daily" };

function entries(
  key: RouteKey,
  meta: RouteMeta,
  lastModified: Date,
  params?: Record<string, string>,
): MetadataRoute.Sitemap {
  const paths = alternatePaths(key, params);
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, `${BASE}${paths[locale]}`]),
  );
  return LOCALES.map((locale) => ({
    url: `${BASE}${paths[locale]}`,
    lastModified,
    changeFrequency: meta.changeFrequency,
    priority: meta.priority,
    alternates: { languages },
  }));
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    ...Object.entries(ROUTES).flatMap(([key, meta]) =>
      entries(key as RouteKey, meta, now),
    ),
    ...allPostSlugs().flatMap((slug) => entries("/blog/[slug]", ARTICLE, now, { slug })),
    ...allGuideSlugs().flatMap((slug) => entries("/rehber/[slug]", ARTICLE, now, { slug })),
    ...CAMPAIGN_TEMPLATES.flatMap((c) =>
      entries("/kampanya/[slug]", CAMPAIGN, now, { slug: c.key.replace(/_/g, "-") }),
    ),
  ];
}
