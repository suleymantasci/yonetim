import { siteConfig } from "@yonetim/config";
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, type Locale } from "@yonetim/i18n";
import { pathnames } from "@yonetim/i18n/routing";

/**
 * Rota anahtarından dil başına genel URL yolu üretir — SPEC Bölüm 10.1.
 *
 * Tek doğruluk kaynağı `routing.pathnames`'tir: hem `<link rel="alternate">`
 * hem sitemap buradan beslenir, böylece çevrilmiş yollar (örn. `/en/pricing`)
 * iki yerde ayrı ayrı yazılmaz ve birbirinden sapamaz.
 */
export type RouteKey = keyof typeof pathnames;

export function localizedPath(
  key: RouteKey,
  locale: Locale,
  params?: Record<string, string>,
): string {
  const entry = pathnames[key] as string | Record<Locale, string>;
  let path = typeof entry === "string" ? entry : entry[locale];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      path = path.replace(`[${name}]`, value);
    }
  }
  // `localePrefix: "as-needed"` — varsayılan dilde önek yazılmaz.
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return path === "/" ? prefix || "/" : `${prefix}${path}`;
}

/** Tüm dillerdeki karşılıklar — `pageMeta({ alternatePaths })` için. */
export function alternatePaths(
  key: RouteKey,
  params?: Record<string, string>,
): Record<Locale, string> {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, localizedPath(key, locale, params)]),
  ) as Record<Locale, string>;
}

/**
 * `alternates.languages` için hazır sözlük — `x-default` dahil.
 * Sayfa bazlı `pageMeta` çağrılarında `alternatePaths` tercih edilir; bu
 * yardımcı yalnızca `pageMeta` kullanmayan kök layout içindir.
 */
export function hreflangEntries(
  key: RouteKey,
  params?: Record<string, string>,
): Record<string, string> {
  const paths = alternatePaths(key, params);
  const entries: Record<string, string> = {};
  for (const locale of LOCALES) {
    entries[LOCALE_META[locale].htmlLang] = `${siteConfig.env.baseUrl}${paths[locale]}`;
  }
  entries["x-default"] = `${siteConfig.env.baseUrl}${paths[DEFAULT_LOCALE]}`;
  return entries;
}
