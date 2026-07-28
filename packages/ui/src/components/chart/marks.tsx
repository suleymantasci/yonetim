"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_INK, seriesColor, type Series } from "./palette";

/**
 * Grafik işaretleri — Recharts sarmalayıcıları.
 *
 * MİMARİ KARAR (F0.3, önceki kararın yerine geçer): grafik motoru artık
 * Recharts. Önceki karar "harici grafik kütüphanesi yok" idi ve dört temel
 * form için doğru bir karardı; ölçek büyüdükçe iki maliyeti göründü:
 *
 *  1. **Elle yazılan ölçek yanlış cevaplar veriyordu.** `BarChart({horizontal})`
 *     sessizce tek seriye düşüyordu (`series[0]` dışındakiler yutuluyordu);
 *     sabit `viewBox width=640` küçük ekranda eksen yazılarını da küçültüyordu
 *     — 320px'lik bir telefonda 10px'lik tick fiilen 5px oluyordu.
 *  2. **Her yeni form yeni bir ölçek/eksen/tooltip kopyası demekti.** Yığılmış
 *     alan, waterfall, çok serili yatay sütun… beşinci formda dosya 1200 satırı
 *     geçiyordu ve her biri ayrı ayrı hatalıydı.
 *
 * BEDELİ VE AZALTMASI: ~95 kB ve SSR yok. Bu yüzden motor `chart/lazy.tsx`
 * üzerinden **grafikle birebir aynı yükseklikte** bir iskeletle yükleniyor
 * (CLS bütçesi 0.1) ve `ChartFrame`'in tablo görünümü motora hiç bağlı değil
 * (`chart/frame.tsx`) — JS gelmese de veri okunur kalır.
 *
 * KORUNAN SÖZLEŞMELER: `seriesColor(index)`, `CHART_SERIES_LIMIT = 6`,
 * `Series {key,label,values,form}`, `ChartFrameProps`, lejant kuralı
 * (2+ seride zorunlu), tek eksen kuralı, "6'dan fazla seri → Diğer".
 */

const TICK = { fill: CHART_INK.tick, fontSize: 11 } as const;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

/** `useId()` iki nokta üretiyor; `url(#…)` içinde güvenli olsun diye temizlenir. */
function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

type Row = Record<string, string | number | null>;

interface TooltipItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  payload?: Record<string, unknown>;
}

/**
 * Ortak tooltip kartı.
 *
 * Recharts'ın varsayılanı satır içi stil kullanıyor ve tema değişkenlerini
 * görmüyor; koyu temada beyaz kutu olarak kalıyordu. Kendi kartımız yüzey
 * token'larını kullanır ve sayıları `tabular-nums` ile hizalar.
 */
function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  note,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: string | number;
  formatValue: (value: number) => string;
  /** İlgili nokta için ek not (ör. "tahmin"). */
  note?: (label: string) => string | undefined;
}) {
  if (!active || !payload?.length) return null;

  const seen = new Set<string>();
  const rows = payload
    .filter((item) => typeof item.value === "number")
    .filter((item) => {
      const name = String(item.name ?? item.dataKey ?? "");
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });

  if (rows.length === 0) return null;

  const text = String(label ?? "");
  const extra = note?.(text);

  return (
    <div className="pointer-events-none min-w-40 rounded-lg border border-border bg-surface-raised p-2.5 text-xs shadow-lg">
      <div className="font-semibold text-fg">{text}</div>
      <ul className="mt-1.5 space-y-1">
        {rows.map((item) => (
          <li
            key={String(item.dataKey ?? item.name)}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {String(item.name ?? "")}
            </span>
            <span className="font-semibold tabular-nums text-fg">
              {formatValue(item.value as number)}
            </span>
          </li>
        ))}
      </ul>
      {extra ? <div className="mt-1.5 text-[11px] italic text-fg-subtle">{extra}</div> : null}
    </div>
  );
}

interface CartesianProps {
  labels: string[];
  series: Series[];
  /** Eksen etiketi biçimi — kısa olmalı ("125 B ₺"). */
  formatValue: (value: number) => string;
  /** Tooltip biçimi; verilmezse `formatValue` kullanılır. */
  tooltipFormat?: (value: number) => string;
  height?: number;
}

function toRows(labels: string[], series: Series[]): Row[] {
  return labels.map((label, i) => {
    const row: Row = { label };
    for (const item of series) row[item.key] = item.values[i] ?? 0;
    return row;
  });
}

function hasNegative(series: Series[]): boolean {
  return series.some((item) => item.values.some((value) => value < 0));
}

/* ------------------------------------------------------------------ *
 * Çizgi / alan grafiği
 * ------------------------------------------------------------------ */

/**
 * Çizgi (ve dolgulu alan) grafiği — tahsilat oranı, nakit akışı.
 *
 * Tahmin bölgesi iki ayrı veri anahtarıyla çiziliyor (`key` ve `key__f`):
 * tek bir çizgiye "buradan sonrası kesikli" demenin Recharts'ta karşılığı yok
 * ve olsaydı bile tooltip gerçekleşen ile tahmini aynı satırda gösterirdi.
 * Bağlantı noktası (`forecastFrom`) **iki seride de** var, yoksa çizgi kopar.
 */
export function LineChart({
  labels,
  series,
  formatValue,
  tooltipFormat,
  height = 220,
  area = false,
  forecastFrom,
  forecastLabel,
  reference,
}: CartesianProps & {
  area?: boolean;
  forecastFrom?: number;
  forecastLabel?: string;
  /** Hedef/eşik çizgisi — "iyi" ile "kötü"yü ayıran yatay referans. */
  reference?: { value: number; label: string };
}) {
  const gradientId = safeId(useId());
  const forecasting = forecastFrom !== undefined && forecastFrom < labels.length;

  const data: Row[] = labels.map((label, i) => {
    const row: Row = { label };
    for (const item of series) {
      const value = item.values[i] ?? 0;
      if (!forecasting) {
        row[item.key] = value;
        continue;
      }
      row[item.key] = i <= forecastFrom! ? value : null;
      row[`${item.key}__f`] = i >= forecastFrom! ? value : null;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={MARGIN} accessibilityLayer>
        <defs>
          {series.map((item, index) => (
            <linearGradient
              key={item.key}
              id={`${gradientId}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={seriesColor(index)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={seriesColor(index)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid vertical={false} stroke={CHART_INK.grid} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART_INK.grid }}
          tick={TICK}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={TICK}
          tickMargin={6}
          width={56}
          allowDecimals={false}
          tickFormatter={(value: number) => formatValue(value)}
        />
        {hasNegative(series) ? (
          <ReferenceLine y={0} stroke={CHART_INK.zero} strokeWidth={1} />
        ) : null}

        {/*
         * Hedef çizgisi: "oran iyi mi" sorusu ancak bir eşikle cevaplanır.
         * Etiket çizginin üstünde ve sağda — veri çizgisiyle çakışmıyor.
         */}
        {reference ? (
          <ReferenceLine
            y={reference.value}
            stroke={CHART_INK.axis}
            strokeDasharray="6 4"
            /*
             * `ifOverflow` varsayılanı "discard": hedef, verinin ölçeğinin
             * dışında kalırsa çizgi **sessizce hiç çizilmiyordu** — %0
             * tahsilatlı bir sitede tam da görülmesi gereken durumda.
             * "extendDomain" ekseni hedefe kadar açıyor; aradaki mesafe
             * grafiğin asıl anlattığı şey.
             */
            ifOverflow="extendDomain"
            label={{
              value: reference.label,
              position: "insideTopRight",
              fill: CHART_INK.tick,
              fontSize: 11,
            }}
          />
        ) : null}

        {/* Tahmin bölgesi: gerçekleşen ile tahmin aynı yüzeyde karışmasın. */}
        {forecasting ? (
          <ReferenceArea
            x1={labels[forecastFrom!]}
            x2={labels[labels.length - 1]}
            fill={CHART_INK.grid}
            fillOpacity={0.35}
          />
        ) : null}

        <Tooltip
          cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
          content={
            <ChartTooltip
              formatValue={tooltipFormat ?? formatValue}
              note={
                forecasting && forecastLabel
                  ? (text) => {
                      const index = labels.indexOf(text);
                      return index >= forecastFrom! ? forecastLabel : undefined;
                    }
                  : undefined
              }
            />
          }
        />

        {series.map((item, index) =>
          area ? (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={seriesColor(index)}
              strokeWidth={2}
              fill={`url(#${gradientId}-${index})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
              isAnimationActive={false}
            />
          ) : (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label}
              stroke={seriesColor(index)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
              isAnimationActive={false}
            />
          ),
        )}

        {forecasting
          ? series.map((item, index) => (
              <Line
                key={`${item.key}__f`}
                type="monotone"
                dataKey={`${item.key}__f`}
                name={item.label}
                stroke={seriesColor(index)}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
                isAnimationActive={false}
              />
            ))
          : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Yığılmış alan
 * ------------------------------------------------------------------ */

/** Yığılmış alan — bütünün zaman içindeki bileşimi (tahsil edilen / kalan). */
export function StackedAreaChart({
  labels,
  series,
  formatValue,
  tooltipFormat,
  height = 240,
}: CartesianProps) {
  const gradientId = safeId(useId());
  const data = toRows(labels, series);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={MARGIN} accessibilityLayer>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.key} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(index)} stopOpacity={0.7} />
              <stop offset="100%" stopColor={seriesColor(index)} stopOpacity={0.25} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke={CHART_INK.grid} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART_INK.grid }}
          tick={TICK}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={TICK}
          tickMargin={6}
          width={56}
          allowDecimals={false}
          tickFormatter={(value: number) => formatValue(value)}
        />
        <Tooltip
          cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }}
          content={<ChartTooltip formatValue={tooltipFormat ?? formatValue} />}
        />
        {series.map((item, index) => (
          <Area
            key={item.key}
            type="monotone"
            stackId="stack"
            dataKey={item.key}
            name={item.label}
            stroke={seriesColor(index)}
            strokeWidth={1.5}
            fill={`url(#${gradientId}-${index})`}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Sütun grafiği (gruplu / yığılmış / yatay)
 * ------------------------------------------------------------------ */

/**
 * Sütun grafiği.
 *
 * `horizontal` artık **gerçekten çok serili**: eski sürüm sessizce
 * `series[0]` dışındaki serileri yutuyordu (Faz 3 hata listesi #5).
 */
export function BarChart({
  labels,
  series,
  formatValue,
  tooltipFormat,
  height = 220,
  stacked = false,
  horizontal = false,
}: CartesianProps & {
  stacked?: boolean;
  horizontal?: boolean;
}) {
  const data = toRows(labels, series);
  const last = series.length - 1;
  const negative = hasNegative(series);

  // Yatay kipte kategori ekseni yazıyı taşımalı; en uzun etikete göre yer ayır.
  const categoryWidth = Math.min(
    168,
    Math.max(72, Math.max(...labels.map((label) => label.length)) * 7 + 12),
  );

  const radiusFor = (index: number): [number, number, number, number] => {
    if (stacked && index !== last) return [0, 0, 0, 0];
    return horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={MARGIN}
        barGap={2}
        barCategoryGap={horizontal ? "24%" : "22%"}
        accessibilityLayer
      >
        <CartesianGrid
          vertical={horizontal}
          horizontal={!horizontal}
          stroke={CHART_INK.grid}
          strokeDasharray="4 4"
        />
        {horizontal ? (
          <>
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickMargin={6}
              allowDecimals={false}
              tickFormatter={(value: number) => formatValue(value)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: CHART_INK.grid }}
              tick={TICK}
              tickMargin={8}
              width={categoryWidth}
            />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: CHART_INK.grid }}
              tick={TICK}
              tickMargin={8}
              minTickGap={12}
              interval="preserveStartEnd"
            />
            <YAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickMargin={6}
              width={56}
              allowDecimals={false}
              tickFormatter={(value: number) => formatValue(value)}
            />
          </>
        )}

        {negative ? (
          horizontal ? (
            <ReferenceLine x={0} stroke={CHART_INK.zero} />
          ) : (
            <ReferenceLine y={0} stroke={CHART_INK.zero} />
          )
        ) : null}

        <Tooltip
          cursor={{ fill: "var(--color-hover)" }}
          content={<ChartTooltip formatValue={tooltipFormat ?? formatValue} />}
        />

        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            name={item.label}
            fill={seriesColor(index)}
            stackId={stacked ? "stack" : undefined}
            radius={radiusFor(index)}
            maxBarSize={horizontal ? 28 : 44}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Waterfall — akış: neyden nereye
 * ------------------------------------------------------------------ */

export interface WaterfallItem {
  key: string;
  label: string;
  /** `kind: "delta"` için değişim (±), `"total"` için mutlak değer. */
  value: number;
  kind?: "delta" | "total";
}

/**
 * Waterfall — gelir-gider akışı.
 *
 * Yığılmış sütunun aksine "nereden nereye" sorusunu cevaplar: her çubuk bir
 * öncekinin bittiği yerden başlar. Taşıyıcı (görünmez) segment `base`
 * anahtarında; görünen segment `magnitude`'da. Tooltip **işaretli** değeri
 * gösterir, yoksa gider kalemleri pozitif okunurdu.
 */
export function WaterfallChart({
  items,
  formatValue,
  tooltipFormat,
  height = 240,
}: {
  items: WaterfallItem[];
  formatValue: (value: number) => string;
  tooltipFormat?: (value: number) => string;
  height?: number;
}) {
  let running = 0;
  const data = items.map((item) => {
    if (item.kind === "total") {
      running = item.value;
      return {
        label: item.label,
        base: Math.min(0, item.value),
        magnitude: Math.abs(item.value),
        signed: item.value,
        kind: "total" as const,
      };
    }
    const start = running;
    const end = running + item.value;
    running = end;
    return {
      label: item.label,
      base: Math.min(start, end),
      magnitude: Math.abs(item.value),
      signed: item.value,
      kind: "delta" as const,
    };
  });

  const colorFor = (row: (typeof data)[number]): string => {
    if (row.kind === "total") return "var(--color-chart-1)";
    return row.signed >= 0 ? "var(--color-success)" : "var(--color-danger)";
  };

  const format = tooltipFormat ?? formatValue;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={MARGIN} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={CHART_INK.grid} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: CHART_INK.grid }}
          tick={TICK}
          tickMargin={8}
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={TICK}
          tickMargin={6}
          width={56}
          allowDecimals={false}
          tickFormatter={(value: number) => formatValue(value)}
        />
        <ReferenceLine y={0} stroke={CHART_INK.zero} />
        <Tooltip
          cursor={{ fill: "var(--color-hover)" }}
          content={<WaterfallTooltip format={format} colorFor={colorFor} />}
        />
        <Bar dataKey="base" stackId="w" fill="none" isAnimationActive={false} />
        <Bar dataKey="magnitude" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={56} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.label} fill={colorFor(row)} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

interface WaterfallRow {
  label: string;
  base: number;
  magnitude: number;
  signed: number;
  kind: "delta" | "total";
}

/** Waterfall tooltip'i **işaretli** değeri gösterir; çubuk mutlak değeri çiziyor. */
function WaterfallTooltip({
  active,
  payload,
  label,
  format,
  colorFor,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: string | number;
  format: (value: number) => string;
  colorFor: (row: WaterfallRow) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as WaterfallRow | undefined;
  if (!row) return null;

  return (
    <div className="pointer-events-none min-w-36 rounded-lg border border-border bg-surface-raised p-2.5 text-xs shadow-lg">
      <div className="font-semibold text-fg">{String(label ?? "")}</div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: colorFor(row) }}
        />
        <span className="font-semibold tabular-nums text-fg">
          {row.signed > 0 && row.kind === "delta" ? "+" : ""}
          {format(row.signed)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Halka grafiği
 * ------------------------------------------------------------------ */

/**
 * Halka grafiği. Yalnızca **bütünün payı** anlatılırken ve dilim sayısı ≤ 6
 * olduğunda kullanılır (tahsil/gecikme kırılımı). Merkez sayısı headline'dır.
 */
export function DonutChart({
  slices,
  formatValue,
  centerLabel,
  centerValue,
  size = 176,
}: {
  slices: { key: string; label: string; value: number }[];
  formatValue: (value: number) => string;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const data = slices.map((slice) => ({ ...slice, value: Math.max(0, slice.value) }));

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="66%"
            outerRadius="92%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={total > 0 ? 1.5 : 0}
            stroke={CHART_INK.surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((slice, index) => (
              <Cell key={slice.key} fill={seriesColor(index)} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
        </PieChart>
        {centerValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-heading text-xl font-extrabold tabular-nums text-fg">
              {centerValue}
            </span>
            {centerLabel ? (
              <span className="mt-0.5 max-w-24 text-[11px] leading-tight text-fg-subtle">
                {centerLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Dilim değerleri doğrudan etiketlenir — renk tek başına kimlik taşımaz. */}
      <ul className="min-w-40 flex-1 space-y-2">
        {slices.map((slice, index) => {
          const share = total > 0 ? Math.max(0, slice.value) / total : 0;
          return (
            <li key={slice.key} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: seriesColor(index) }}
                  />
                  <span className="truncate text-fg-muted">{slice.label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-fg">
                  {formatValue(slice.value)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  aria-hidden
                  className="h-full rounded-full"
                  style={{
                    width: `${(share * 100).toFixed(1)}%`,
                    backgroundColor: seriesColor(index),
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
