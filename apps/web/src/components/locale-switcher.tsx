"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import {
  LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, LOCALE_META, type Locale,
} from "@yonetim/i18n";
import { cn } from "@yonetim/ui";

import { usePathname } from "@/i18n/navigation";
import { localizedPath, type RouteKey } from "@/lib/paths";

/**
 * Dil seçici — SPEC Bölüm 4.2.
 *
 * Gerçek `<a>` bağlantısı üretir: adres çevrilmiş karşılığına gider
 * (`/fiyatlandirma` → `/en/pricing`), kullanıcı bulunduğu sayfada kalır,
 * arama motorları bağlantıyı takip edebilir ve JavaScript kapalıyken de
 * çalışır. Tıklamada seçim ayrıca çereze yazılır; sonraki ziyaretlerde
 * ana sayfa doğrudan tercih edilen dilde açılır.
 *
 * Adres `localizedPath` ile üretilir (kaynak: `routing.pathnames`). next-intl'in
 * `Link locale=…` bileşeni varsayılan dile de önek yazar (`/tr/…`) ve fazladan
 * bir 307 yönlendirmesi doğar; buradaki üretim `localePrefix: "as-needed"`
 * kuralına birebir uyar ve doğrudan kanonik adrese gider.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const t = useTranslations("common.locale");
  const pathname = usePathname() as RouteKey;
  // Dinamik segmentler ([slug] gibi) hedef adreste korunur.
  const params = useParams() as Record<string, string>;

  function remember(locale: Locale) {
    document.cookie =
      `${LOCALE_COOKIE}=${locale}; path=${LOCALE_COOKIE_OPTIONS.path};` +
      ` max-age=${LOCALE_COOKIE_OPTIONS.maxAge}; samesite=${LOCALE_COOKIE_OPTIONS.sameSite}`;
  }

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5",
        className,
      )}
    >
      <Globe aria-hidden className="mx-1 h-3.5 w-3.5 text-fg-subtle" />
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <a
            key={locale}
            href={localizedPath(pathname, locale, params)}
            hrefLang={LOCALE_META[locale].htmlLang}
            aria-current={isActive ? "true" : undefined}
            onClick={() => remember(locale)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors",
              isActive
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-subtle hover:bg-hover hover:text-fg",
            )}
          >
            {locale}
            <span className="sr-only">
              {" "}
              — {t("switchTo", { name: LOCALE_META[locale].nativeName })}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
