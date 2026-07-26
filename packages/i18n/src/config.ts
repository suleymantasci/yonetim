/**
 * i18n yapılandırması — SPEC Bölüm 4.2 / 10.1.
 *
 * Strateji iki uygulamada farklıdır ve bu bilinçlidir:
 *
 *  • **Pazarlama sitesi (apps/web):** URL segmenti ile locale (`/fiyatlandirma`,
 *    `/en/pricing`). SEO için zorunlu — her dil ayrı, indekslenebilir bir adres
 *    ister ve `hreflang` ancak böyle doğru kurulur. Türkçe önek almaz
 *    (`localePrefix: "as-needed"`), çünkü varsayılan dil ve mevcut adresler korunur.
 *
 *  • **Ürün uygulaması (apps/app):** URL'de locale yoktur; dil kullanıcının
 *    profil/çerez tercihinden gelir. Panel sayfaları `noindex` olduğu için SEO
 *    kazancı yok, buna karşılık her rotayı ikiye katlamanın maliyeti yüksek.
 */
export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";

/** V2'de açılacak diller (SPEC Bölüm 1.3) — henüz mesaj dosyaları yok. */
export const PLANNED_LOCALES = ["ar", "ru", "de"] as const;

export const RTL_LOCALES: readonly string[] = ["ar"];

export const LOCALE_COOKIE = "yonetim_locale";

export interface LocaleMeta {
  code: Locale;
  /** Dilin kendi adı (dil seçicide gösterilir). */
  nativeName: string;
  /** `<html lang>` ve `hreflang` değeri. */
  htmlLang: string;
  /** Intl biçimlendirme yerel adı. */
  formatLocale: string;
  currency: string;
  direction: "ltr" | "rtl";
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  tr: {
    code: "tr",
    nativeName: "Türkçe",
    htmlLang: "tr",
    formatLocale: "tr-TR",
    currency: "TRY",
    direction: "ltr",
  },
  en: {
    code: "en",
    nativeName: "English",
    htmlLang: "en",
    formatLocale: "en-GB",
    // Ürün Türkiye pazarına satılır; tutarlar her dilde ₺ gösterilir.
    currency: "TRY",
    direction: "ltr",
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function localeMeta(locale: string): LocaleMeta {
  return LOCALE_META[parseLocale(locale)];
}

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * `Accept-Language` başlığından en uygun dili seçer.
 * Desteklenmeyen diller varsayılana düşer.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        tag: (tag ?? "").trim().toLowerCase(),
        quality: q ? Number(q.split("=")[1]) || 0 : 1,
      };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0]!;
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Çerez seçenekleri — dil tercihi bir yıl saklanır. */
export const LOCALE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
  httpOnly: false,
};
