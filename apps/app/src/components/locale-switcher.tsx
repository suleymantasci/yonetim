"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS, LOCALE_META } from "@yonetim/i18n";
import { cn } from "@yonetim/ui";

/**
 * Dil seçici (uygulama) — SPEC Bölüm 4.2.
 *
 * Ürün uygulamasında locale URL'de taşınmadığı için adres değişmez; seçim
 * çereze yazılır ve sayfa yenilenerek sunucu bileşenleri yeni dille render edilir.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const active = useLocale();
  const t = useTranslations("common.locale");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function select(next: string) {
    if (next === active) return;
    document.cookie =
      `${LOCALE_COOKIE}=${next}; path=${LOCALE_COOKIE_OPTIONS.path};` +
      ` max-age=${LOCALE_COOKIE_OPTIONS.maxAge}; samesite=${LOCALE_COOKIE_OPTIONS.sameSite}`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn( "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe aria-hidden className="mx-1 h-3.5 w-3.5 text-fg-subtle" />
      {LOCALES.map((locale) => {
        const isActive = locale === active;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={pending}
            title={t("switchTo", { name: LOCALE_META[locale].nativeName })}
            onClick={() => select(locale)}
            className={cn( "rounded-md px-2 py-1 text-xs font-semibold uppercase transition-colors",
              isActive ? "bg-surface text-fg shadow-sm" : "text-fg-subtle hover:bg-hover hover:text-fg",
            )}
          >
            {locale}
            <span className="sr-only">
              {" "}
              — {t("switchTo", { name: LOCALE_META[locale].nativeName })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
