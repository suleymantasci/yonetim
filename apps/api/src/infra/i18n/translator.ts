import { DEFAULT_LOCALE, isLocale, type Locale } from "@yonetim/i18n";
import { getMessages } from "@yonetim/panel-messages";

/**
 * Sunucu tarafı çevirici — `next-intl` olmadan.
 *
 * `apps/app` bu işi `getTranslations()` ile yapıyor ama o fonksiyon Next'in
 * istek bağlamına bağlı; Nest'te böyle bir bağlam yok. Katalog zaten
 * `@yonetim/panel-messages` içinde düz JSON olarak duruyor, dolayısıyla ihtiyaç duyulan
 * tek şey nokta yollu arama ve `{param}` yerleştirme.
 *
 * ICU'nun `plural`/`select` yapıları **desteklenmiyor** — bilerek: bot ve
 * bildirim kataloglarında hiç kullanılmıyorlar (kontrol edildi). Gerektiğinde
 * doğru hamle burayı büyütmek değil, `intl-messageformat`'ı bağlamak olur.
 *
 * Anahtar bulunamazsa anahtarın kendisi dönüyor: sessizce boş string dönmek,
 * eksik çeviriyi üretimde görünmez kılardı.
 */
export type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function translatorFor(
  namespace: "notification" | "enum" | "common" | "app",
  locale?: string | null,
): Translator {
  const resolved: Locale = locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
  const bundle = getMessages(resolved)[namespace] as Record<string, unknown>;

  return (key, values) => {
    const raw = lookup(bundle, key);
    if (typeof raw !== "string") return key;
    if (!values) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
  };
}

function lookup(bundle: Record<string, unknown>, path: string): unknown {
  let current: unknown = bundle;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
