import { siteConfig } from "@yonetim/config";
import { LOCALE_META, LOCALES, type Locale } from "@yonetim/i18n";

/** Next.js Metadata yardımcıları — SPEC Bölüm 10.1. */
export interface PageMetaInput {
  title: string;
  description: string;
  path: string;
  imageUrl?: string;
  noIndex?: boolean;
  keywords?: string[];
  publishedTime?: string;
  /** Sayfanın dili — OG `locale` ve `hreflang` çiftleri için. */
  locale?: Locale;
  /**
   * Dil → yol eşlemesi (örn. `{ tr: "/fiyatlandirma", en: "/en/pricing" }`).
   * Verilirse `<link rel="alternate" hreflang>` etiketleri üretilir; sitemap
   * ile aynı bilgiyi `<head>` içinde de sunar (SPEC Bölüm 10.1).
   */
  alternatePaths?: Partial<Record<Locale, string>>;
}

export function pageMeta(input: PageMetaInput) {
  const url = `${siteConfig.env.baseUrl}${input.path}`;
  const image = input.imageUrl ?? `${siteConfig.env.baseUrl}/og-default.png`;
  const locale = input.locale ?? "tr";
  const languages = hreflangMap(input.alternatePaths);
  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: { canonical: url, ...(languages ? { languages } : {}) },
    robots: input.noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: siteConfig.brand.name,
      locale: LOCALE_META[locale].htmlLang.replace("-", "_"),
      type: input.publishedTime ? ("article" as const) : ("website" as const),
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image" as const,
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

/**
 * `hreflang` haritası. `x-default` her zaman varsayılan dile işaret eder;
 * böylece dili belirlenemeyen ziyaretçi Türkçe sürüme yönlendirilir.
 */
function hreflangMap(paths?: Partial<Record<Locale, string>>) {
  if (!paths) return undefined;
  const entries: Record<string, string> = {};
  for (const locale of LOCALES) {
    const path = paths[locale];
    if (path) entries[LOCALE_META[locale].htmlLang] = `${siteConfig.env.baseUrl}${path}`;
  }
  const fallback = paths.tr ?? paths[LOCALES[0]!];
  if (fallback) entries["x-default"] = `${siteConfig.env.baseUrl}${fallback}`;
  return Object.keys(entries).length > 0 ? entries : undefined;
}

/** Programmatic SEO sayfa üreticisi — Bölüm 10.1. */
export interface ProgrammaticPage {
  path: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  keywords: string[];
}

export function cityPage(city: string, districtCount: number, siteCount: number): ProgrammaticPage {
  return {
    path: `/site-yonetimi/${slug(city)}`,
    title: `${city} Site ve Apartman Yönetim Programı | ${siteConfig.brand.name}`,
    description: `${city} genelinde ${siteCount}+ site ${siteConfig.brand.name} ile aidat, gider ve duyuru süreçlerini yönetiyor. 30 gün ücretsiz deneyin.`,
    h1: `${city} için site ve apartman yönetim programı`,
    intro:
      `${city} ve çevresindeki ${districtCount} ilçede apartman yöneticileri aidat takibini Excel yerine ` +
      `${siteConfig.brand.name} ile yapıyor. Sakinler borçlarını WhatsApp'tan öğreniyor, kartla ödüyor.`,
    keywords: [
      `${city} site yönetim programı`,
      `${city} apartman yönetim yazılımı`,
      `${city} aidat takip programı`,
      "site yönetim uygulaması",
    ],
  };
}

export function districtPage(city: string, district: string): ProgrammaticPage {
  return {
    path: `/site-yonetimi/${slug(city)}/${slug(district)}`,
    title: `${district} ${city} Apartman Yönetim Programı | ${siteConfig.brand.name}`,
    description: `${district}, ${city} bölgesindeki siteler için aidat takibi, online tahsilat ve WhatsApp bildirimleri. Kurulum 1 gün.`,
    h1: `${district} (${city}) apartman ve site yönetimi`,
    intro: `${district} bölgesindeki apartman yöneticileri için tasarlanmış dijital yönetim çözümü.`,
    keywords: [
      `${district} apartman yönetimi`,
      `${district} site yönetim programı`,
      `${city} ${district} aidat takibi`,
    ],
  };
}

export function topicPage(topic: { slug: string; title: string; summary: string; keywords: string[] }): ProgrammaticPage {
  return {
    path: `/rehber/${topic.slug}`,
    title: `${topic.title} | ${siteConfig.brand.name} Rehberi`,
    description: topic.summary,
    h1: topic.title,
    intro: topic.summary,
    keywords: topic.keywords,
  };
}

function slug(v: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  return v
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
