"use client";

import { useTranslations } from "next-intl";

import { BarChart, ChartFrame, DonutChart, LineChart } from "@yonetim/ui";

/**
 * Dashboard grafikleri (istemci katmanı) — GAP 4.3.4.
 *
 * Her grafik `ChartFrame` içinde: çerçeve lejantı ve **tablo görünümü**
 * geçişini zorunlu tutuyor. Tablo yalnız bir ek değil; açık temada üç seri
 * rengi 3:1 kontrastın altında kaldığı için erişilebilir eşdeğer olarak
 * gerekli (dataviz "relief" kuralı).
 *
 * Para değerleri **kuruş** olarak geliyor; eksende bin ayracıyla kısaltılmış
 * TL gösteriliyor (12.500.000 kuruş → "125 B ₺"). Tam değer tooltip'te ve
 * tablo görünümünde tam biçimiyle duruyor.
 */
export function DashboardCharts({
  monthly,
  aging,
  forecast,
  collectionSplit,
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
  labels: {
    incomeExpenseTitle: string;
    incomeExpenseHint: string;
    accrued: string;
    collected: string;
    expense: string;
    collectionRateTitle: string;
    collectionRateHint: string;
    rate: string;
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

  /** Kuruş → kısa TL etiketi (eksen için). */
  const shortMoney = (kurus: number): string => {
    const lira = kurus / 100;
    const abs = Math.abs(lira);
    if (abs >= 1_000_000)
      return `${(lira / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} M`;
    if (abs >= 1000)
      return `${Math.round(lira / 1000).toLocaleString("tr-TR")} B`;
    return lira.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
  };

  const fullMoney = (kurus: number): string =>
    `${(kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

  const pct = (value: number): string => `%${value}`;

  const hasData =
    monthly.accruedKurus.some((value) => value > 0) ||
    monthly.collectedKurus.some((value) => value > 0) ||
    monthly.expenseKurus.some((value) => value > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Gelir-gider: aynı birim (kuruş) olduğu için tek eksende çizilebilir. */}
      <div className="lg:col-span-2">
        <ChartFrame
          title={labels.incomeExpenseTitle}
          description={labels.incomeExpenseHint}
          labels={monthly.periodLabels}
          labelsHeader={labels.month}
          series={[
            {
              key: "accrued",
              label: labels.accrued,
              values: monthly.accruedKurus,
            },
            {
              key: "collected",
              label: labels.collected,
              values: monthly.collectedKurus,
            },
            {
              key: "expense",
              label: labels.expense,
              values: monthly.expenseKurus,
            },
          ]}
          formatValue={fullMoney}
          tableToggleLabel={labels.asTable}
          chartToggleLabel={labels.asChart}
          emptyText={hasData ? labels.empty : labels.empty}
        >
          <BarChart
            labels={monthly.periodLabels}
            series={[
              {
                key: "accrued",
                label: labels.accrued,
                values: monthly.accruedKurus,
              },
              {
                key: "collected",
                label: labels.collected,
                values: monthly.collectedKurus,
              },
              {
                key: "expense",
                label: labels.expense,
                values: monthly.expenseKurus,
              },
            ]}
            formatValue={shortMoney}
            height={240}
          />
        </ChartFrame>
      </div>

      {/* Tahsilat oranı yüzde: ayrı grafik — ikinci y ekseni yok. */}
      <ChartFrame
        title={labels.collectionRateTitle}
        description={labels.collectionRateHint}
        labels={monthly.periodLabels}
        labelsHeader={labels.month}
        series={[
          {
            key: "rate",
            label: labels.rate,
            values: monthly.collectionRatePct,
          },
        ]}
        formatValue={pct}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <LineChart
          labels={monthly.periodLabels}
          series={[
            {
              key: "rate",
              label: labels.rate,
              values: monthly.collectionRatePct,
            },
          ]}
          formatValue={pct}
          height={200}
          area
        />
      </ChartFrame>

      <ChartFrame
        title={labels.agingTitle}
        description={labels.agingHint}
        labels={aging.labels.map((key) => labels.agingBuckets[key] ?? key)}
        labelsHeader={labels.bucket}
        series={[
          {
            key: "overdue",
            label: labels.overdueAmount,
            values: aging.amounts,
          },
        ]}
        formatValue={fullMoney}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <BarChart
          labels={aging.labels.map((key) => labels.agingBuckets[key] ?? key)}
          series={[
            {
              key: "overdue",
              label: labels.overdueAmount,
              values: aging.amounts,
            },
          ]}
          formatValue={shortMoney}
          height={200}
          horizontal
        />
      </ChartFrame>

      <div className="lg:col-span-2">
        <ChartFrame
          title={labels.forecastTitle}
          description={labels.forecastHint}
          labels={forecast.periodLabels}
          labelsHeader={labels.month}
          series={[
            { key: "net", label: labels.net, values: forecast.netKurus },
          ]}
          formatValue={fullMoney}
          tableToggleLabel={labels.asTable}
          chartToggleLabel={labels.asChart}
          emptyText={labels.empty}
        >
          <LineChart
            labels={forecast.periodLabels}
            series={[
              { key: "net", label: labels.net, values: forecast.netKurus },
            ]}
            formatValue={shortMoney}
            height={220}
            area
            forecastFrom={forecast.forecastFrom}
            forecastLabel={labels.forecastNote}
          />
        </ChartFrame>
      </div>

      <div className="lg:col-span-2">
        <ChartFrame
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
          tableToggleLabel={labels.asTable}
          chartToggleLabel={labels.asChart}
          emptyText={labels.empty}
        >
          <DonutChart
            slices={[
              {
                key: "paid",
                label: labels.paid,
                value: collectionSplit.paidKurus,
              },
              {
                key: "open",
                label: labels.open,
                value: collectionSplit.openKurus,
              },
              {
                key: "overdue",
                label: labels.overdue,
                value: collectionSplit.overdueKurus,
              },
            ]}
            formatValue={fullMoney}
            centerLabel={labels.totalLabel}
            centerValue={shortMoney(
              collectionSplit.paidKurus +
                collectionSplit.openKurus +
                collectionSplit.overdueKurus,
            )}
          />
        </ChartFrame>
      </div>

      <span className="sr-only">{t("a11y.chartAsTable")}</span>
    </div>
  );
}
