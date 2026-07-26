import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import {
  DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_META, getMessages, negotiateLocale, parseLocale,
} from "@yonetim/i18n";

/**
 * Ürün uygulamasında locale URL'de taşınmaz — SPEC Bölüm 4.2.
 *
 * Panel sayfaları `noindex` olduğu için dil başına ayrı adres üretmenin SEO
 * karşılığı yok; buna karşılık her rotayı ikiye katlamanın maliyeti yüksek.
 * Bu nedenle dil sırasıyla şuradan çözülür:
 *   1. Kullanıcının açık seçimi (çerez),
 *   2. Tarayıcının `Accept-Language` başlığı,
 *   3. Varsayılan dil (Türkçe).
 *
 * Kullanıcı profilinde saklanan dil tercihi, giriş sonrası çereze yazılır.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = DEFAULT_LOCALE;
  if (cookieLocale) {
    locale = parseLocale(cookieLocale);
  } else {
    const headerList = await headers();
    locale = negotiateLocale(headerList.get("accept-language"));
  }

  return {
    locale,
    messages: getMessages(locale),
    timeZone: "Europe/Istanbul",
    formats: {
      number: {
        currency: { style: "currency", currency: LOCALE_META[locale].currency },
      },
    },
  };
});
