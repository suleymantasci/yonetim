"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  BarChart,
  BulletChart,
  ChartFrame,
  DonutChart,
  LineChart,
  StackedAreaChart,
  WaterfallChart,
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
 * ALTI PANO, HEPSİ MEVCUT SÖZLEŞMEDEN: yeni bir API alanı eklenmedi. Takvim
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
  /** Hedef tahsilat oranı (0–1) — bullet panosunun referans çizgisi. */
  collectionTarget: number;
  labels: {
    incomeExpenseTitle: string;
    incomeExpenseHint: string;
    accrued: string;
    collected: string;
    outstanding: string;
    expense: string;
    mixTitle: string;
    mixHint: string;
    rate: string;
    rateTitle: string;
    rateHint: string;
    targetTitle: string;
    targetHint: string;
    target: string;
    aboveTarget: string;
    belowTarget: string;
    agingTitle: string;
    agingHint: string;
    agingBuckets: Record<string, string>;
    overdueAmount: string;
    forecastTitle: string;
    forecastHint: string;
    net: string;
    forecastNote: string;
    flowTitle: string;
    flowHint: string;
    splitTitle: string;
    splitHint: string;
    paid: string;
    open: string;
    overdue: string;
    month: string;
    bucket: string;
    step: string;
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

  const monthCount = monthly.periodLabels.length;
  const lastIndex = monthCount - 1;

  /** Tahakkuk edip henüz tahsil edilmemiş kısım — yığılmış alanın üst katmanı. */
  const outstandingKurus = monthly.accruedKurus.map((accrued, index) =>
    Math.max(0, accrued - (monthly.collectedKurus[index] ?? 0)),
  );

  const agingLabels = aging.labels.map((key) => labels.agingBuckets[key] ?? key);

  /**
   * Son ayın nakit akışı — waterfall.
   *
   * Tahsilat pozitif, gider negatif, net toplam çubuğu. Yığılmış sütunla
   * aynı sayıları gösterirdik ama "neyden nereye" sorusunu cevaplamazdı.
   */
  const lastCollected = monthly.collectedKurus[lastIndex] ?? 0;
  const lastExpense = monthly.expenseKurus[lastIndex] ?? 0;
  const flowItems = [
    { key: "collected", label: labels.collected, value: lastCollected },
    { key: "expense", label: labels.expense, value: -lastExpense },
    {
      key: "net",
      label: labels.net,
      value: lastCollected - lastExpense,
      kind: "total" as const,
    },
  ];

  /** Son üç ayın tahsilat oranı hedefe karşı (bullet). */
  const targetRows = monthly.periodLabels
    .map((label, index) => ({
      key: monthly.periods[index] ?? label,
      label,
      value: monthly.collectionRatePct[index] ?? 0,
      target: collectionTarget * 100,
      max: 100,
    }))
    .slice(-3);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
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

      {/* Tahsil edilen / kalan: bütünün zaman içindeki bileşimi. */}
      <ChartFrame
        title={labels.mixTitle}
        description={labels.mixHint}
        labels={monthly.periodLabels}
        labelsHeader={labels.month}
        series={[
          { key: "collected", label: labels.collected, values: monthly.collectedKurus },
          { key: "outstanding", label: labels.outstanding, values: outstandingKurus },
        ]}
        formatValue={fullMoney}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <StackedAreaChart
          labels={monthly.periodLabels}
          series={[
            { key: "collected", label: labels.collected, values: monthly.collectedKurus },
            { key: "outstanding", label: labels.outstanding, values: outstandingKurus },
          ]}
          formatValue={shortMoney}
          tooltipFormat={fullMoney}
          height={220}
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

      {/*
       * Hedefe karşı son üç ay — bullet.
       *
       * Önce bu blok tahsilat oranı panosunun dipnotuna konmuştu; dipnot
       * küçük punto ve soluk zeminli olduğu için çubuklar ve hedef işareti
       * neredeyse görünmüyordu (tarayıcıda ölçüldü). Kendi panosu olmalıydı:
       * çizgi grafiği **eğilimi**, bullet **bugünkü durumu** anlatıyor.
       */}
      <ChartFrame
        title={labels.targetTitle}
        description={labels.targetHint}
        labels={targetRows.map((row) => row.label)}
        labelsHeader={labels.month}
        series={[
          { key: "rate", label: labels.rate, values: targetRows.map((row) => row.value) },
          { key: "target", label: labels.target, values: targetRows.map((row) => row.target) },
        ]}
        formatValue={pct}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <div className="py-2">
          <BulletChart
            rows={targetRows}
            formatValue={pct}
            targetLabel={labels.target}
            aboveTargetLabel={labels.aboveTarget}
            belowTargetLabel={labels.belowTarget}
          />
        </div>
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
        title={labels.flowTitle}
        description={labels.flowHint}
        labels={flowItems.map((item) => item.label)}
        labelsHeader={labels.step}
        series={[
          { key: "flow", label: labels.net, values: flowItems.map((item) => item.value) },
        ]}
        formatValue={fullMoney}
        tableToggleLabel={labels.asTable}
        chartToggleLabel={labels.asChart}
        emptyText={labels.empty}
      >
        <WaterfallChart
          items={flowItems}
          formatValue={shortMoney}
          tooltipFormat={fullMoney}
          height={220}
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
