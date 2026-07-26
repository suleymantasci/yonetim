import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES } from "./config";

/**
 * Pazarlama sitesi yönlendirme yapılandırması — SPEC Bölüm 10.1.
 *
 * • `localePrefix: "as-needed"` → Türkçe önek almaz (`/fiyatlandirma`), İngilizce
 *   alır (`/en/pricing`). Varsayılan dilin mevcut adresleri korunur.
 *
 * • `pathnames` → her dilin kendi anahtar kelimeli adresi olur. Bu, arama
 *   motorlarında iki dilde de görünürlük için gereklidir; `/en/dues-calculation`
 *   İngilizce sorgularda `/aidat-hesaplama`dan çok daha iyi eşleşir.
 *
 * Tenant landing sayfası (`/[slug]`) bilinçli olarak çevrilmez: site adı
 * kısaltması her dilde aynı adrestir ve dış bağlantılar bozulmamalıdır.
 */
export const pathnames = {
  "/": "/",
  "/ozellikler": { tr: "/ozellikler", en: "/features" },
  "/fiyatlandirma": { tr: "/fiyatlandirma", en: "/pricing" },
  "/kampanyalar": { tr: "/kampanyalar", en: "/offers" },
  "/kampanya/[slug]": { tr: "/kampanya/[slug]", en: "/offers/[slug]" },
  "/gecis": { tr: "/gecis", en: "/switching" },
  "/blog": "/blog",
  "/blog/[slug]": "/blog/[slug]",
  "/rehber/[slug]": { tr: "/rehber/[slug]", en: "/guides/[slug]" },
  "/sss": { tr: "/sss", en: "/faq" },
  "/kvkk": { tr: "/kvkk", en: "/privacy" },
  "/[slug]": "/[slug]",
} as const;

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: true,
  pathnames,
});

export type AppPathname = keyof typeof pathnames;
