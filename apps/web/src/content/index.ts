import { DEFAULT_LOCALE, type Locale } from "@yonetim/i18n";

import { trContent } from "./tr";
import { enContent } from "./en";

/**
 * Uzun biçimli pazarlama içeriği — SPEC Bölüm 10.1.
 *
 * Blog yazıları ve rehberler mesaj dosyalarında (JSON) tutulmaz: bunlar
 * paragraf uzunluğunda, biçimlendirmeli metinlerdir ve dil başına ayrı yazılır.
 * Kısa arayüz metinleri `packages/i18n` altındadır; burada yalnızca içerik var.
 */
export interface Post {
  slug: string;
  category: "rehber" | "mevzuat" | "urun";
  title: string;
  description: string;
  publishedAt: string;
  readingMinutes: number;
  keywords: string[];
  body: string;
}

export interface GuideTopic {
  slug: string;
  title: string;
  summary: string;
  keywords: string[];
  sections: { heading: string; body: string }[];
}

export interface KillerFeature {
  slug: string;
  title: string;
  description: string;
  detail: string;
  specRef: string;
}

export interface Faq {
  question: string;
  answer: string;
}

export interface ComparisonRow {
  feature: string;
  us: boolean | "partial" | "soon";
  apsiyon: boolean | "partial";
  biyos: boolean | "partial";
  yonetimcell: boolean | "partial";
}

export interface LocaleContent {
  posts: Post[];
  guides: GuideTopic[];
  killerFeatures: KillerFeature[];
  faqs: Faq[];
  comparison: ComparisonRow[];
}

const CONTENT: Record<Locale, LocaleContent> = {
  tr: trContent,
  en: enContent,
};

export function getContent(locale: string): LocaleContent {
  return CONTENT[locale as Locale] ?? CONTENT[DEFAULT_LOCALE];
}

export function postBySlug(locale: string, slug: string): Post | undefined {
  return getContent(locale).posts.find((p) => p.slug === slug);
}

export function guideBySlug(locale: string, slug: string): GuideTopic | undefined {
  return getContent(locale).guides.find((g) => g.slug === slug);
}

/**
 * Tüm dillerdeki slug'ların birleşimi — `generateStaticParams` için.
 * Slug'lar diller arasında aynı tutulur; böylece dil değiştirince aynı yazıda
 * kalınır ve `hreflang` eşleşmesi doğru kurulur.
 */
export function allPostSlugs(): string[] {
  return [...new Set(Object.values(CONTENT).flatMap((c) => c.posts.map((p) => p.slug)))];
}

export function allGuideSlugs(): string[] {
  return [...new Set(Object.values(CONTENT).flatMap((c) => c.guides.map((g) => g.slug)))];
}
