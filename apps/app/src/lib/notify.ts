import { getLocale, getTranslations } from "next-intl/server";

import type { Locale } from "@yonetim/i18n";

/**
 * E-posta / bot şablonları için çevirici — SPEC Bölüm 4.2.
 *
 * `@yonetim/emails` ve `@yonetim/whatsapp` dile bağımsızdır: anahtar + parametre
 * alır, metni buradan gelen `Translator` üretir. `notification` namespace'i
 * `email.*` ve `bot.*` gruplarını birlikte taşır.
 */
export type Translator = (key: string, values?: Record<string, string | number>) => string;

export async function notificationTranslator(locale?: Locale): Promise<Translator> {
  const resolved = locale ?? ((await getLocale()) as Locale);
  const t = await getTranslations({ locale: resolved, namespace: "notification" });
  return (key, values) => t(key, values ?? {});
}

/** Enum etiketleri (rol, kanal, borç türü…) için çevirici. */
export async function enumTranslator(locale?: Locale): Promise<Translator> {
  const resolved = locale ?? ((await getLocale()) as Locale);
  const t = await getTranslations({ locale: resolved, namespace: "enum" });
  return (key, values) => t(key, values ?? {});
}
