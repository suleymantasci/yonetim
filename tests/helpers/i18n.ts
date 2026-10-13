import { LOCALES, type Locale } from "@yonetim/i18n";
import { getMessages } from "@yonetim/panel-messages";

/**
 * Test çevirmeni — gerçek mesaj dosyalarını okur.
 *
 * Sahte (mock) bir çevirmen kullanmıyoruz: böylece testler hem davranışı hem de
 * anahtarların gerçekten var olduğunu doğrular. Eksik bir anahtar testi düşürür.
 */
export class MissingMessageError extends Error {
  constructor(
    readonly locale: string,
    readonly key: string,
  ) {
    super(`[i18n] '${locale}' dilinde eksik anahtar: ${key}`);
    this.name = "MissingMessageError";
  }
}

function lookup(bundle: unknown, path: string[]): unknown {
  return path.reduce<unknown>(
    (acc, part) =>
      acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
    bundle,
  );
}

/**
 * ICU yer tutucularını doldurur. Basit `{name}` değişimi ve `{count, plural, ...}`
 * formunun `#` ikamesini destekler — testler için yeterli.
 */
function interpolate(template: string, values: Record<string, string | number>): string {
  let out = template.replace(
    /\{(\w+),\s*plural,\s*([^}]*(?:\{[^}]*\}[^}]*)*)\}/g,
    (_, name: string, body: string) => {
      const count = Number(values[name] ?? 0);
      const one = /one\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
      const other = /other\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
      return (count === 1 ? one : other).replace(/#/g, String(count));
    },
  );
  out = out.replace(/\{(\w+)\}/g, (_, name: string) =>
    values[name] === undefined ? `{${name}}` : String(values[name]),
  );
  return out;
}

export type TestTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Belirli bir namespace için çevirmen üretir.
 * `t("bot.debtNone", { unit: "12" })` → notification.bot.debtNone
 */
export function createTranslator(locale: Locale, namespace: string): TestTranslator {
  const bundle = getMessages(locale);
  const root = lookup(bundle, namespace.split("."));
  if (root === undefined) throw new MissingMessageError(locale, namespace);

  return (key, values) => {
    const value = lookup(root, key.split("."));
    if (typeof value !== "string") throw new MissingMessageError(locale, `${namespace}.${key}`);
    return values ? interpolate(value, values) : value;
  };
}

/** Test biçimlendiricileri — dile bağlı, ancak deterministik. */
export function createFormatters(locale: Locale) {
  const money = new Intl.NumberFormat(locale === "en" ? "en-GB" : "tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  });
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
  return {
    money: (kurus: number) => money.format(kurus / 100),
    date: (d: Date) => date.format(d),
  };
}

/** Bot testleri için hazır bağlam: her iki dilde aynı senaryoyu koşmak üzere. */
export function botDeps(locale: Locale) {
  return {
    t: createTranslator(locale, "notification"),
    tEnum: createTranslator(locale, "enum"),
    format: createFormatters(locale),
  };
}

export { LOCALES };
