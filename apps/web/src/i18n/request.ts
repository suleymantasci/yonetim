import { getRequestConfig } from "next-intl/server";

import { getMessages, LOCALE_META, parseLocale } from "@yonetim/i18n";
import { routing } from "@yonetim/i18n/routing";

/**
 * next-intl istek yapılandırması — SPEC Bölüm 4.2.
 * Locale URL segmentinden gelir (`localePrefix: "as-needed"`); geçersizse
 * varsayılan dile düşer.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = parseLocale(requested ?? routing.defaultLocale);

  return {
    locale,
    messages: getMessages(locale),
    timeZone: "Europe/Istanbul",
    // Tutarlar her dilde ₺; ayırıcılar dile göre değişir.
    formats: {
      number: {
        currency: { style: "currency", currency: LOCALE_META[locale].currency },
      },
    },
  };
});
