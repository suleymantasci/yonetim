"use client";

import {
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { cn } from "../../cn";
import type {
  BarChart as BarChartMark,
  DonutChart as DonutChartMark,
  LineChart as LineChartMark,
  StackedAreaChart as StackedAreaChartMark,
  WaterfallChart as WaterfallChartMark,
} from "./marks";

export type { WaterfallItem } from "./marks";

/**
 * Grafik motorunun yükleme sınırı.
 *
 * ÜÇ ZORUNLULUK BURADA KARŞILANIYOR:
 *
 *  1. **Motor sunucuda çalışmaz.** Recharts ölçüyü DOM'dan alır; sunucuda
 *     0×0 bir kutu üretir. Bu yüzden hidrasyon öncesi hiç render edilmez.
 *     `next/dynamic({ssr:false})` yerine hidrasyon kapısı kullanılıyor:
 *     `packages/ui` Next'e bağımlı değil ve öyle kalmalı (aynı gerekçeyle
 *     `navigation.tsx` `linkComponent` enjekte ediyor). Sonuç aynı, bağımlılık
 *     bir eksik.
 *  2. **İskelet grafikle birebir aynı yükseklikte.** Aksi hâlde motor gelince
 *     sayfa zıplar ve CLS bütçesi (0.1) kırılır. Yükseklik tek yerden geçiyor:
 *     `height` hem iskelete hem grafiğe aynı sayı olarak gidiyor.
 *  3. **Veri motora bağlı değil.** `ChartFrame`'in tablo görünümü bu dosyayı
 *     hiç görmez; motor hiç yüklenmese de sayı okunabilir kalır.
 */

const marks = () => import("./marks");

const LineChartLazy = lazy(() => marks().then((m) => ({ default: m.LineChart })));
const BarChartLazy = lazy(() => marks().then((m) => ({ default: m.BarChart })));
const StackedAreaChartLazy = lazy(() =>
  marks().then((m) => ({ default: m.StackedAreaChart })),
);
const WaterfallChartLazy = lazy(() => marks().then((m) => ({ default: m.WaterfallChart })));
const DonutChartLazy = lazy(() => marks().then((m) => ({ default: m.DonutChart })));

function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

/** Grafik yüklenirken duran iskelet — eksen + azalan sütunlar, `aria-hidden`. */
export function ChartSkeleton({
  height = 220,
  className,
}: {
  height?: number;
  className?: string;
}) {
  const bars = [0.55, 0.8, 0.42, 0.68, 0.9, 0.5, 0.72];
  return (
    <div
      aria-hidden
      className={cn("flex w-full items-end gap-2 border-b border-border pb-px", className)}
      style={{ height }}
    >
      {bars.map((ratio, index) => (
        <div
          key={index}
          className="motion-safe:animate-pulse flex-1 rounded-t bg-surface-sunken"
          style={{ height: `${ratio * 100}%` }}
        />
      ))}
    </div>
  );
}

function ChartCanvas({
  height,
  minHeight,
  children,
}: {
  height?: number;
  minHeight?: number;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const box = height !== undefined ? { height } : { minHeight };
  const fallback = <ChartSkeleton height={height ?? minHeight ?? 220} />;

  return (
    <div className="w-full" style={box}>
      {hydrated ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}

export function LineChart(props: ComponentProps<typeof LineChartMark>) {
  return (
    <ChartCanvas height={props.height ?? 220}>
      <LineChartLazy {...props} />
    </ChartCanvas>
  );
}

export function BarChart(props: ComponentProps<typeof BarChartMark>) {
  return (
    <ChartCanvas height={props.height ?? 220}>
      <BarChartLazy {...props} />
    </ChartCanvas>
  );
}

export function StackedAreaChart(props: ComponentProps<typeof StackedAreaChartMark>) {
  return (
    <ChartCanvas height={props.height ?? 240}>
      <StackedAreaChartLazy {...props} />
    </ChartCanvas>
  );
}

export function WaterfallChart(props: ComponentProps<typeof WaterfallChartMark>) {
  return (
    <ChartCanvas height={props.height ?? 240}>
      <WaterfallChartLazy {...props} />
    </ChartCanvas>
  );
}

/**
 * Halka grafiği yükseklik yerine **en az** yükseklikle sarılıyor: lejant
 * dar ekranda halkanın altına sarıyor ve sabit yükseklik onu kırpardı.
 */
export function DonutChart(props: ComponentProps<typeof DonutChartMark>) {
  return (
    <ChartCanvas minHeight={props.size ?? 176}>
      <DonutChartLazy {...props} />
    </ChartCanvas>
  );
}
