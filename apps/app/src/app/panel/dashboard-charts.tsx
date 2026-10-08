"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  BarChart,
  ChartFrame,
  DonutChart,
  LineChart,
} from "@yonetim/ui";

/**
 * Kontrol paneli grafikleri (istemci katmanı) — GAP 4.3.4, UI Faz 2.2.
 *
 * Her grafik `ChartFrame` içinde: çerçeve lejantı ve **tablo görünümü**
 * geçişini zorunlu tutuyor. Tablo yalnız bir ek değil; açık temada üç seri
 * rengi 3:1 kontrastın altında kaldığı için erişilebilir eşdeğer olarak
 * gerekli (dataviz "relief" kuralı) — ve grafik motoru `ssr:false` yüklendiği
 * için JS gelmeden okunabilen tek sürüm o.
 *
 * BEŞ PANO, HEPSİ MEVCUT SÖZLEŞMEDEN: yeni bir API alanı eklenmedi.
 * Aynı sayıyı ikinci kez çizen panolar kaldırıldı (2026-10-08): tahsilat
 * bileşimi (= tahakkuk − tahsilat, ilk panonun iki serisi), hedefe karşı son
 * üç ay (= oran grafiği + KPI kartı) ve bu ayın şelalesi (= "Bu ay tahsilat"
 * ve "Bu ayki gider" kartları; ayın neti nakit akışı panosunda da var). Takvim
 * ısı haritası bilerek yok — `dashboardCharts` günlük çözünürlükte veri
 * taşımıyor ve "yoğunluk" panosunu uydurma veriyle kurmak, sosyal kanıta
 * uydurma müşteri sayısı yazmakla aynı şey olurdu.
 *
 * Para değerleri **kuruş** olarak geliyor; eksende bin ayracıyla kısaltılmış
 * TL gösteriliyor (12.500.000 kuruş → "125 B ₺"). Tam değer tooltip'te ve
 * tablo görünümünde tam biçimiyle duruyor — `tooltipFormat` bunun için var.
 */
export function DashboardCharts({
  monthly,
  aging,
  forecast,
  collectionSplit,
  collectionTarget,
  labels,
}: {
  monthly: {
    periods: string[];
    periodLabels: string[];
    accruedKurus: number[];
    collectedKurus: number[];
    expenseKurus: number[];
    collectionRatePct: number[];
  };
  aging: { labels: string[]; amounts: number[] };
  forecast: {
    periodLabels: string[];
    netKurus: number[];
    forecastFrom: number;
    assumedCollectionRate: number;
  };
  collectionSplit: {
    paidKurus: number;
    openKurus: number;
    overdueKurus: number;
  };
  /** Hedef tahsilat oranı (0–1) — oran grafiğinin referans çizgisi. */
  collectionTarget: number;
  labels: {
    incomeExpenseTitle: string;
    incomeExpenseHint: string;
    accrued: string;
    collected: string;
    expense: string;
    rate: string;
    rateTitle: string;
    rateHint: string;
    target: string;
    agingTitle: string;
    agingHint: string;
    agingBuckets: Record<string, string>;
    overdueAmount: string;
    forecastTitle: string;
    forecastHint: string;
    net: string;
    forecastNote: string;
    splitTitle: string;
    splitHint: string;
    paid: string;
    open: string;
    overdue: string;
    month: string;
    bucket: string;
    asTable: string;
    asChart: string;
    empty: string;
    totalLabel: string;
  };
}) {
  const t = useTranslations("common");
  const locale = useLocale();

  /** Kuruş → kısa TL etiketi (eksen için). */
  const shortMoney = (kurus: number): string => {
    const lira = kurus / 100;
    const abs = Math.abs(lira);
    if (abs >= 1_000_000)
      return `${(lira / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })} M`;
    if (abs >= 1000) return `${Math.round(lira / 1000).toLocaleString(locale)} B`;
    return lira.toLocaleString(locale, { maximumFractionDigits: 0 });
  };

  const fullMoney = (kurus: number): string =>
    `${(kurus / 100).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ₺`;

  const pct = (value: number): string =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
      value / 100,
    );

  const agingLabels = aging.labels.map((key) => labels.agingBuckets[key] ?? key);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* Gelir-gider: aynı birim (kuruş) olduğu için tek eksende çizilebilir. */}
      <ChartFrame
        className="xl:col-span-2"
        title={labels.incomeExpenseTitle}
        description={labels.incomeExpenseHint}
        labels={monthly.periodLabels}
        labelsHeader={labels.month}
        series={[
          { key: "accrued", label: labels.accrued, values: monthly.accruedKurus },
          { key: "collected", label: labels.collected, values: monthly.collectedKurus },
          { key: "expense", label: labels.expense, values: monthly.expenseKurus },
        ]}
        formatValue={fullMoney}
        totalLabel={labels.totalLabel}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <BarChart
          labels={monthly.periodLabels}
          series={[
            { key: "accrued", label: labels.accrued, values: monthly.accruedKurus },
            { key: "collected", label: labels.collected, values: monthly.collectedKurus },
            { key: "expense", label: labels.expense, values: monthly.expenseKurus },
          ]}
          formatValue={shortMoney}
          tooltipFormat={fullMoney}
          height={260}
        />
      </ChartFrame>

      {/* Tahsilat oranı yüzde: ayrı grafik — ikinci y ekseni yok. */}
      <ChartFrame
        title={labels.rateTitle}
        description={labels.rateHint}
        labels={monthly.periodLabels}
        labelsHeader={labels.month}
        series={[{ key: "rate", label: labels.rate, values: monthly.collectionRatePct }]}
        formatValue={pct}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <LineChart
          labels={monthly.periodLabels}
          series={[{ key: "rate", label: labels.rate, values: monthly.collectionRatePct }]}
          formatValue={pct}
          height={220}
          area
          reference={{
            value: collectionTarget * 100,
            label: `${labels.target} ${pct(collectionTarget * 100)}`,
          }}
        />
      </ChartFrame>

      <ChartFrame
        title={labels.agingTitle}
        description={labels.agingHint}
        labels={agingLabels}
        labelsHeader={labels.bucket}
        series={[{ key: "overdue", label: labels.overdueAmount, values: aging.amounts }]}
        formatValue={fullMoney}
        totalLabel={labels.totalLabel}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <BarChart
          labels={agingLabels}
          series={[{ key: "overdue", label: labels.overdueAmount, values: aging.amounts }]}
          formatValue={shortMoney}
          tooltipFormat={fullMoney}
          height={220}
          horizontal
        />
      </ChartFrame>

      <ChartFrame
        className="xl:col-span-2"
        title={labels.forecastTitle}
        description={labels.forecastHint}
        labels={forecast.periodLabels}
        labelsHeader={labels.month}
        series={[{ key: "net", label: labels.net, values: forecast.netKurus }]}
        formatValue={fullMoney}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
        footnote={labels.forecastNote}
      >
        <LineChart
          labels={forecast.periodLabels}
          series={[{ key: "net", label: labels.net, values: forecast.netKurus }]}
          formatValue={shortMoney}
          tooltipFormat={fullMoney}
          height={240}
          area
          forecastFrom={forecast.forecastFrom}
          forecastLabel={labels.forecastNote}
        />
      </ChartFrame>

      <ChartFrame
        className="xl:col-span-2"
        title={labels.splitTitle}
        description={labels.splitHint}
        labels={[labels.paid, labels.open, labels.overdue]}
        labelsHeader={labels.bucket}
        series={[
          {
            key: "split",
            label: labels.totalLabel,
            values: [
              collectionSplit.paidKurus,
              collectionSplit.openKurus,
              collectionSplit.overdueKurus,
            ],
          },
        ]}
        formatValue={fullMoney}
        totalLabel={labels.totalLabel}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <DonutChart
          slices={[
            { key: "paid", label: labels.paid, value: collectionSplit.paidKurus },
            { key: "open", label: labels.open, value: collectionSplit.openKurus },
            { key: "overdue", label: labels.overdue, value: collectionSplit.overdueKurus },
          ]}
          formatValue={fullMoney}
          centerLabel={labels.totalLabel}
          centerValue={shortMoney(
            collectionSplit.paidKurus + collectionSplit.openKurus + collectionSplit.overdueKurus,
          )}
        />
      </ChartFrame>

      <span className="sr-only">{t("a11y.chartAsTable")}</span>
    </div>
  );
}
