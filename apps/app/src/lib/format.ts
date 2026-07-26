import { getLocale } from "next-intl/server";

import {
  formatDateFor, formatDateTimeFor, formatMoney, formatPercent, formatPeriodFor,
} from "@yonetim/i18n";

/**
 * Sunucu bileşenleri için dile duyarlı biçimlendiriciler.
 *
 * `@yonetim/core` içindeki `formatKurus`/`formatDate` yardımcıları sabit
 * Türkçe yereldir ve yalnızca dil bağımsız bağlamlarda (log, dosya adı)
 * kullanılır. Kullanıcıya görünen her değer buradan geçer.
 */
export async function formatters() {
  const locale = await getLocale();
  return {
    locale,
    money: (kurus: number) => formatMoney(kurus, locale),
    date: (value: Date) => formatDateFor(value, locale),
    dateTime: (value: Date) => formatDateTimeFor(value, locale),
    percent: (ratio: number, digits = 0) => formatPercent(ratio, locale, digits),
    period: (periodKey: string) => formatPeriodFor(periodKey, locale),
  };
}

export type Formatters = Awaited<ReturnType<typeof formatters>>;
