/**
 * Grafik paleti ve seri sözleşmesi.
 *
 * BİLEREK "use client" YOK ve bilerek hiçbir şeye bağımlı değil: hem sunucu
 * bileşenleri hem istemci grafik motoru aynı renk kaynağını okusun diye.
 *
 * Renkler `var(--color-chart-N)` **string'i** olarak taşınır, hex olarak
 * değil: tema değişince CSS değişkeni yeniden çözülür, grafiğin yeniden
 * kurulmasına (remount) gerek kalmaz. `tests/design-tokens.test.ts` sabit
 * hex yazılmasını zaten kırar.
 *
 * Palet **sıra bağımlıdır**: renk seriye göre atanır, sıralamaya göre değil.
 * Sıra renk körlüğü ayrımı (komşu çiftlerde OKLab ΔE ≥ 8) esas alınarak
 * seçildi; `tokens.css` kendi başlığında "kozmetik değildir" diyor.
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
  return SERIES_COLORS[Math.min(Math.max(0, index), SERIES_COLORS.length - 1)]!;
}

/** Tek renk (büyüklük) rampası — ısı haritası, doluluk. 0 = en açık, 6 = en koyu. */
export function sequentialColor(step: number): string {
  const clamped = Math.min(6, Math.max(0, Math.round(step)));
  return `var(--color-seq-${clamped + 1})`;
}

export interface Series {
  key: string;
  label: string;
  values: number[];
  /** Bileşik grafikte bu seri sütun mu çizgi mi. */
  form?: "line" | "bar" | "area";
}

/** Grafik yüzeyinde tekrar eden çizgi/metin renkleri — tek yerden. */
export const CHART_INK = {
  grid: "var(--color-border)",
  axis: "var(--color-border-strong)",
  tick: "var(--color-fg-subtle)",
  surface: "var(--color-surface)",
  zero: "var(--color-border-strong)",
  positive: "var(--color-div-pos)",
  negative: "var(--color-div-neg)",
  neutral: "var(--color-fg-subtle)",
} as const;
