"use client";

import { useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "../cn";

/**
 * Grafik bileşenleri — GAP 4.3.4 / Sprint 3.
 *
 * MİMARİ KARAR: harici grafik kütüphanesi yok. Recharts ~100 kB gzip getirir;
 * ihtiyacımız olan dört form (çizgi, sütun, alan, halka) düz SVG ile ~400
 * satırda çiziliyor ve sunucuda render edilebiliyor. Etkileşim (crosshair +
 * tooltip) yalnızca `pointermove` dinleyicisi gerektiriyor.
 *
 * ZORUNLU KURALLAR (dataviz yöntemi):
 * - **Tek eksen.** İki farklı ölçekli ölçü asla aynı grafikte iki y ekseninde
 *   gösterilmez; gelir-gider gibi çiftler aynı birimde (kuruş) olduğu için
 *   tek eksende çizilir.
 * - Renk **seriye** bağlıdır, sıralamaya değil: `seriesIndex` sabit kalır.
 * - 2+ seride lejant her zaman vardır → kimlik asla yalnız renkle taşınmaz.
 * - Her grafik `ChartFrame` içinde gelir; çerçeve **tablo görünümünü zorunlu
 *   tutar** (açık temada 3 seri rengi 3:1 kontrastın altında — "relief" kuralı)
 *   ve aynı tablo ekran okuyucu için tek doğru kaynaktır.
 * - Izgara ve eksenler geri planda (`text-fg-subtle`, ince çizgi).
 */

const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
] as const;

export const CHART_SERIES_LIMIT = SERIES_COLORS.length;

export function seriesColor(index: number): string {
  // 6'dan sonrası üretilmez: çağıran taraf "Diğer"de toplamalıdır.
  return SERIES_COLORS[Math.min(index, SERIES_COLORS.length - 1)]!;
}

export interface Series {
  key: string;
  label: string;
  values: number[];
  /** Bileşik grafikte bu seri sütun mu çizgi mi. */
  form?: "line" | "bar" | "area";
}

export interface ChartFrameProps {
  title: string;
  description?: string;
  /** X ekseni etiketleri — tablo görünümünde satır başlığı olur. */
  labels: string[];
  series: Series[];
  /** Değerleri okunur metne çevirir (para, yüzde). */
  formatValue: (value: number) => string;
  labelsHeader: string;
  tableToggleLabel: string;
  chartToggleLabel: string;
  emptyText: string;
  children: ReactNode;
  action?: ReactNode;
}

/**
 * Grafik çerçevesi: başlık, lejant, grafik/tablo geçişi.
 * Tablo yalnız bir "ek" değil; grafiğin erişilebilir eşdeğeri.
 */
export function ChartFrame({
  title,
  description,
  labels,
  series,
  formatValue,
  labelsHeader,
  tableToggleLabel,
  chartToggleLabel,
  emptyText,
  children,
  action,
}: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const empty = series.length === 0 || labels.length === 0;

  return (
    <figure className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <figcaption className="min-w-0">
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
        </figcaption>
        <div className="flex items-center gap-2">
          {action}
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-hover hover:text-fg"
          >
            {asTable ? chartToggleLabel : tableToggleLabel}
          </button>
        </div>
      </div>

      {/* Lejant: 2+ seride her zaman. Tek seride başlık zaten seriyi adlandırır. */}
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 pt-3">
          {series.map((item, index) => (
            <li key={item.key} className="flex items-center gap-1.5 text-xs text-fg-muted">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: seriesColor(index) }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="p-4">
        {empty ? (
          <p className="py-10 text-center text-sm text-fg-subtle">{emptyText}</p>
        ) : asTable ? (
          <ChartTable
            labels={labels}
            series={series}
            formatValue={formatValue}
            labelsHeader={labelsHeader}
          />
        ) : (
          children
        )}
      </div>
    </figure>
  );
}

function ChartTable({
  labels,
  series,
  formatValue,
  labelsHeader,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  labelsHeader: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
            <th scope="col" className="px-2 py-2 font-medium">
              {labelsHeader}
            </th>
            {series.map((item, index) => (
              <th key={item.key} scope="col" className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: seriesColor(index) }}
                  />
                  {item.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, row) => (
            <tr key={label} className="border-b border-border last:border-0">
              <th scope="row" className="px-2 py-2 text-left font-medium text-fg">
                {label}
              </th>
              {series.map((item) => (
                <td key={item.key} className="px-2 py-2 text-right tabular-nums text-fg">
                  {formatValue(item.values[row] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ölçek yardımcıları
 * ------------------------------------------------------------------ */

const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function useScale(series: Series[], stacked: boolean) {
  return useMemo(() => {
    const totals = stacked
      ? (series[0]?.values ?? []).map((_, i) =>
          series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0),
        )
      : series.flatMap((s) => s.values);
    const max = niceCeil(Math.max(0, ...totals));
    const min = Math.min(0, ...series.flatMap((s) => s.values));
    return { max, min: min < 0 ? -niceCeil(-min) : 0 };
  }, [series, stacked]);
}

function gridTicks(min: number, max: number, count = 4): number[] {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + step * i);
}

/* ------------------------------------------------------------------ *
 * Çizgi / alan grafiği
 * ------------------------------------------------------------------ */

/**
 * Çizgi (ve dolgulu alan) grafiği — tahsilat oranı, nakit akışı forecast.
 * Crosshair + tooltip varsayılan olarak açık: HTML grafik zaten etkileşimli.
 */
export function LineChart({
  labels,
  series,
  formatValue,
  height = 220,
  area = false,
  /** Kesikli çizgiyle gösterilecek ilk indeks (tahmin/forecast bölgesi). */
  forecastFrom,
  forecastLabel,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  height?: number;
  area?: boolean;
  forecastFrom?: number;
  forecastLabel?: string;
}) {
  const width = 640;
  const scale = useScale(series, false);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const stepX = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  const x = (i: number) => PAD.left + stepX * i;
  const y = (value: number) =>
    PAD.top + innerH - ((value - scale.min) / (scale.max - scale.min || 1)) * innerH;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-pan-y"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          const svgX = ratio * width - PAD.left;
          const index = Math.round(svgX / (stepX || 1));
          setHover(Math.max(0, Math.min(labels.length - 1, index)));
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* Izgara — geri planda, yalnız yatay çizgiler. */}
        {gridTicks(scale.min, scale.max).map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 3.5}
              textAnchor="end"
              className="fill-current text-[10px] text-fg-subtle"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {/* Forecast bölgesi gölgesi — tahmin ile gerçekleşen karışmasın. */}
        {forecastFrom !== undefined && forecastFrom < labels.length ? (
          <rect
            x={x(forecastFrom)}
            y={PAD.top}
            width={Math.max(0, width - PAD.right - x(forecastFrom))}
            height={innerH}
            className="fill-current text-surface-sunken"
            opacity={0.7}
          />
        ) : null}

        <g clipPath={`url(#${clipId})`}>
          {series.map((item, index) => {
            const color = seriesColor(index);
            const points = item.values.map((value, i) => `${x(i)},${y(value)}`);
            const solidCount = forecastFrom ?? item.values.length;
            return (
              <g key={item.key}>
                {area ? (
                  <polygon
                    points={`${x(0)},${y(scale.min)} ${points.join(" ")} ${x(item.values.length - 1)},${y(scale.min)}`}
                    fill={color}
                    opacity={0.14}
                  />
                ) : null}
                <polyline
                  points={points.slice(0, solidCount + 1).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {forecastFrom !== undefined ? (
                  <polyline
                    points={points.slice(solidCount).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                ) : null}
                {/* Noktalar ≥ 8px: dokunmatik hedef ve üst üste binmede 2px yüzey halkası. */}
                {item.values.map((value, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(value)}
                    r={hover === i ? 5 : 3.5}
                    fill={color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            );
          })}
        </g>

        {/* Crosshair */}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="currentColor"
            className="text-border-strong"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {/* X etiketleri — kalabalıkta seyreltilir. */}
        {labels.map((label, i) => {
          const stride = Math.ceil(labels.length / 8);
          if (i % stride !== 0 && i !== labels.length - 1) return null;
          return (
            <text
              key={label + i}
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
              className="fill-current text-[10px] text-fg-subtle"
            >
              {label}
            </text>
          );
        })}
      </svg>

      {hover !== null ? (
        <ChartTooltip
          label={labels[hover]!}
          rows={series.map((item, index) => ({
            key: item.key,
            label: item.label,
            color: seriesColor(index),
            value: formatValue(item.values[hover] ?? 0),
          }))}
          note={forecastFrom !== undefined && hover >= forecastFrom ? forecastLabel : undefined}
          leftPct={(x(hover) / width) * 100}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sütun grafiği (gruplu / yığılmış)
 * ------------------------------------------------------------------ */

export function BarChart({
  labels,
  series,
  formatValue,
  height = 220,
  stacked = false,
  horizontal = false,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
}) {
  const width = 640;
  const scale = useScale(series, stacked);
  const [hover, setHover] = useState<number | null>(null);

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, labels.length);
  const barGap = 2; // yüzey boşluğu: komşu sütunlar birbirine değmez
  const barWidth = stacked
    ? Math.min(38, slot * 0.6)
    : Math.max(4, (Math.min(48, slot * 0.7) - barGap * (series.length - 1)) / series.length);

  const yFor = (value: number) =>
    PAD.top + innerH - ((value - scale.min) / (scale.max - scale.min || 1)) * innerH;

  if (horizontal) {
    return (
      <HorizontalBars
        labels={labels}
        series={series}
        formatValue={formatValue}
        max={scale.max}
      />
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
        onPointerLeave={() => setHover(null)}
      >
        {gridTicks(scale.min, scale.max).map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={yFor(tick) + 3.5}
              textAnchor="end"
              className="fill-current text-[10px] text-fg-subtle"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, i) => {
          const groupX = PAD.left + slot * i;
          let stackTop = 0;
          return (
            <g
              key={label + i}
              onPointerEnter={() => setHover(i)}
              onPointerMove={() => setHover(i)}
            >
              {/* Vurgu için tüm slot dokunma hedefi (mark'tan büyük). */}
              <rect
                x={groupX}
                y={PAD.top}
                width={slot}
                height={innerH}
                fill={hover === i ? "var(--color-hover)" : "transparent"}
              />
              {series.map((item, s) => {
                const value = Math.max(0, item.values[i] ?? 0);
                if (stacked) {
                  const y0 = yFor(stackTop);
                  const y1 = yFor(stackTop + value);
                  stackTop += value;
                  const barHeight = Math.max(0, y0 - y1 - barGap);
                  return (
                    <rect
                      key={item.key}
                      x={groupX + (slot - barWidth) / 2}
                      y={y1}
                      width={barWidth}
                      height={barHeight}
                      rx={3}
                      fill={seriesColor(s)}
                    />
                  );
                }
                const groupWidth = barWidth * series.length + barGap * (series.length - 1);
                const y1 = yFor(value);
                return (
                  <rect
                    key={item.key}
                    x={groupX + (slot - groupWidth) / 2 + s * (barWidth + barGap)}
                    y={y1}
                    width={barWidth}
                    height={Math.max(0, yFor(0) - y1)}
                    rx={3}
                    fill={seriesColor(s)}
                  />
                );
              })}
              <text
                x={groupX + slot / 2}
                y={height - 8}
                textAnchor="middle"
                className="fill-current text-[10px] text-fg-subtle"
              >
                {labels.length > 12 && i % 2 === 1 ? "" : label}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={yFor(0)}
          y2={yFor(0)}
          stroke="currentColor"
          className="text-border-strong"
          strokeWidth={1}
        />
      </svg>

      {hover !== null ? (
        <ChartTooltip
          label={labels[hover]!}
          rows={series.map((item, index) => ({
            key: item.key,
            label: item.label,
            color: seriesColor(index),
            value: formatValue(item.values[hover] ?? 0),
          }))}
          leftPct={((PAD.left + slot * hover + slot / 2) / width) * 100}
        />
      ) : null}
    </div>
  );
}

/** Yatay sütunlar — kategori adları uzun olduğunda (gider dağılımı). */
function HorizontalBars({
  labels,
  series,
  formatValue,
  max,
}: {
  labels: string[];
  series: Series[];
  formatValue: (value: number) => string;
  max: number;
}) {
  const first = series[0];
  if (!first) return null;

  return (
    <ul className="space-y-2.5">
      {labels.map((label, i) => {
        const value = first.values[i] ?? 0;
        const pct = max > 0 ? (value / max) * 100 : 0;
        return (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-fg">{label}</span>
              <span className="shrink-0 tabular-nums font-medium text-fg">
                {formatValue(value)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: seriesColor(i) }}
              />
            </div>
          </li>
        );
      })}
    </ul>
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
  size = 168,
}: {
  slices: { key: string; label: string; value: number }[];
  formatValue: (value: number) => string;
  centerLabel?: string;
  centerValue?: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" role="img" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-surface-sunken)"
            strokeWidth={16}
          />
          {slices.map((slice, index) => {
            const fraction = total > 0 ? Math.max(0, slice.value) / total : 0;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seriesColor(index)}
                strokeWidth={16}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference - dash + 2}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return element;
          })}
        </svg>
        {centerValue ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
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
      <ul className="min-w-40 flex-1 space-y-1.5">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: seriesColor(index) }}
              />
              <span className="truncate text-fg-muted">{slice.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium text-fg">
              {formatValue(slice.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tooltip + sparkline
 * ------------------------------------------------------------------ */

function ChartTooltip({
  label,
  rows,
  note,
  leftPct,
}: {
  label: string;
  rows: { key: string; label: string; color: string; value: string }[];
  note?: string;
  leftPct: number;
}) {
  return (
    <output
      className="pointer-events-none absolute top-2 z-10 block min-w-36 -translate-x-1/2 rounded-lg border border-border bg-surface-raised p-2 text-xs shadow-lg"
      style={{ left: `${Math.min(88, Math.max(12, leftPct))}%` }}
    >
      <div className="font-semibold text-fg">{label}</div>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span
                aria-hidden
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
              {row.label}
            </span>
            <span className="tabular-nums font-medium text-fg">{row.value}</span>
          </li>
        ))}
      </ul>
      {note ? <div className="mt-1 text-[10px] italic text-fg-subtle">{note}</div> : null}
    </output>
  );
}

/** Stat kartı içine gömülen mini trend — eksen yok, yalnız şekil. */
export function Sparkline({
  values,
  tone = "brand",
  height = 32,
  label,
}: {
  values: number[];
  tone?: "brand" | "success" | "danger";
  height?: number;
  label: string;
}) {
  if (values.length < 2) return null;
  const width = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke =
    tone === "success"
      ? "var(--color-success)"
      : tone === "danger"
        ? "var(--color-danger)"
        : "var(--color-chart-1)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", "text-fg-subtle")}
      style={{ height }}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
