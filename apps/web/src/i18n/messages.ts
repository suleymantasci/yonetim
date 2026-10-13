/**
 * Pazarlama sitesi mesaj yükleyici — SPEC Bölüm 4.2.
 *
 * Landing'in mesajları panelden ayrı (`apps/web/messages/<locale>/<ns>.json`):
 * panel metni her değiştiğinde web imajı yeniden derleniyordu. `common` ve
 * `enum`'un burada kullanılan kısmı (`billingPeriod`, `migrationSource`,
 * `tenantType`) panelin kopyası; ikisi bilerek bağımsız, birini
 * değiştirmek diğerini değiştirmez.
 *
 * Statik `import`: paketleyici hangi dosyaların gerektiğini derleme anında görür.
 */
import { DEFAULT_LOCALE, type Locale } from "@yonetim/i18n";

import trCommon from "../../messages/tr/common.json";
import trEnum from "../../messages/tr/enum.json";
import trMarketing from "../../messages/tr/marketing.json";

import enCommon from "../../messages/en/common.json";
import enEnum from "../../messages/en/enum.json";
import enMarketing from "../../messages/en/marketing.json";

const BUNDLES = {
  tr: { common: trCommon, enum: trEnum, marketing: trMarketing },
  en: { common: enCommon, enum: enEnum, marketing: enMarketing },
} as const;

export type Messages = (typeof BUNDLES)[typeof DEFAULT_LOCALE];
export type Namespace = keyof Messages;

/** Verilen dilin tüm mesajlarını döner. Bilinmeyen dil varsayılana düşer. */
export function getMessages(locale: string): Messages {
  return (BUNDLES[locale as Locale] ?? BUNDLES[DEFAULT_LOCALE]) as Messages;
}

/** Yalnızca belirli namespace'leri yükler (istemciye giden mesajlar için). */
export function getNamespaces<K extends Namespace>(
  locale: string,
  namespaces: readonly K[],
): Pick<Messages, K> {
  const all = getMessages(locale);
  const picked = {} as Pick<Messages, K>;
  for (const ns of namespaces) picked[ns] = all[ns];
  return picked;
}
