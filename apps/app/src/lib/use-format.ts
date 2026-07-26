"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";

import {
  formatDateFor, formatDateTimeFor, formatMoney, formatPercent, formatPeriodFor,
} from "@yonetim/i18n";

/**
 * `formatters()`'ın istemci karşılığı — SPEC Bölüm 4.2.
 * Aynı `Intl` önbelleklerini kullanır, böylece sunucu ve istemci çıktısı birebir aynıdır.
 */
export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      locale,
      money: (kurus: number) => formatMoney(kurus, locale),
      date: (value: Date) => formatDateFor(value, locale),
      dateTime: (value: Date) => formatDateTimeFor(value, locale),
      percent: (ratio: number, digits = 0) => formatPercent(ratio, locale, digits),
      period: (periodKey: string) => formatPeriodFor(periodKey, locale),
    }),
    [locale],
  );
}
