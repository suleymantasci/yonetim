import { LOCALE_META, type Locale, parseLocale } from "./config";

/**
 * Dile duyarlı biçimlendirme.
 *
 * Tutarlar her dilde ₺ gösterilir (ürün Türkiye pazarına satılır), ancak binlik
 * ve ondalık ayırıcılar ile tarih düzeni seçilen dile göre değişir.
 * `Intl.NumberFormat` örnekleri pahalıdır; dil başına önbelleğe alınır.
 */
const currencyCache = new Map<string, Intl.NumberFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeCache = new Map<string, Intl.DateTimeFormat>();

function currencyFormatter(locale: Locale): Intl.NumberFormat {
  const meta = LOCALE_META[locale];
  let f = currencyCache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(meta.formatLocale, {
      style: "currency",
      currency: meta.currency,
      minimumFractionDigits: 2,
    });
    currencyCache.set(locale, f);
  }
  return f;
}

/** Kuruş cinsinden tam sayıyı para birimi olarak biçimlendirir. */
export function formatMoney(kurus: number, locale: string): string {
  return currencyFormatter(parseLocale(locale)).format(kurus / 100);
}

export function formatAmount(tl: number, locale: string): string {
  return currencyFormatter(parseLocale(locale)).format(tl);
}

export function formatNumber(value: number, locale: string): string {
  const l = parseLocale(locale);
  let f = numberCache.get(l);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE_META[l].formatLocale);
    numberCache.set(l, f);
  }
  return f.format(value);
}

export function formatPercent(ratio: number, locale: string, digits = 0): string {
  return new Intl.NumberFormat(LOCALE_META[parseLocale(locale)].formatLocale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

export function formatDateFor(date: Date, locale: string): string {
  const l = parseLocale(locale);
  let f = dateCache.get(l);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE_META[l].formatLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Istanbul",
    });
    dateCache.set(l, f);
  }
  return f.format(date);
}

export function formatDateTimeFor(date: Date, locale: string): string {
  const l = parseLocale(locale);
  let f = dateTimeCache.get(l);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE_META[l].formatLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Istanbul",
    });
    dateTimeCache.set(l, f);
  }
  return f.format(date);
}

/** `2026-03` biçimindeki dönem anahtarını dile uygun ay adına çevirir. */
export function formatPeriodFor(periodKey: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) return periodKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const formatter = new Intl.DateTimeFormat(LOCALE_META[parseLocale(locale)].formatLocale, {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
  return formatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
}
