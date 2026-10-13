/**
 * Panel mesaj yükleyici — SPEC Bölüm 4.2.
 *
 * Ürünün (apps/app, api, worker) mesajları. Pazarlama sitesinin mesajları
 * ayrı: `apps/web/messages` — panel metni değişince landing imajı yeniden
 * derlenmesin diye. `common` ve `enum`'un landing'in kullandığı kısmı orada
 * kopya olarak duruyor; ikisi bilerek bağımsız.
 *
 * Mesajlar namespace başına ayrı JSON dosyalarında tutulur
 * (`packages/panel-messages/messages/<locale>/<namespace>.json`). Bu, dosyaların
 * yönetilebilir kalmasını sağlar ve çakışmaları azaltır.
 *
 * Statik `import` kullanılır: paketleyici hangi dosyaların gerektiğini derleme
 * anında görür, böylece dinamik `require` gerekmez ve edge çalışma zamanında da
 * sorunsuz çalışır.
 */
import trCommon from "../messages/tr/common.json";
import trEnum from "../messages/tr/enum.json";
import trApp from "../messages/tr/app.json";
import trMaintenance from "../messages/tr/maintenance.json";
import trKvkk from "../messages/tr/kvkk.json";
import trNotification from "../messages/tr/notification.json";

import enCommon from "../messages/en/common.json";
import enEnum from "../messages/en/enum.json";
import enApp from "../messages/en/app.json";
import enMaintenance from "../messages/en/maintenance.json";
import enKvkk from "../messages/en/kvkk.json";
import enNotification from "../messages/en/notification.json";

import { DEFAULT_LOCALE, type Locale } from "@yonetim/i18n";

const BUNDLES = {
  tr: {
    common: trCommon,
    enum: trEnum,
    app: trApp,
    maintenance: trMaintenance,
    kvkk: trKvkk,
    notification: trNotification,
  },
  en: {
    common: enCommon,
    enum: enEnum,
    app: enApp,
    maintenance: enMaintenance,
    kvkk: enKvkk,
    notification: enNotification,
  },
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

export { BUNDLES };
