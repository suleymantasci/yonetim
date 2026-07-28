import { cn } from "../../cn";

/**
 * Motor gerektirmeyen grafik ilkelleri.
 *
 * Bunlar bilerek Recharts kullanmaz ve bilerek `"use client"` değildir:
 * üçü de tek bir `<svg>` ya da birkaç `<div>`; sunucuda render edilirler,
 * hidrasyon beklemezler ve JS hiç gelmese de doğru görünürler. Recharts'a
 * bağlamak, kart içindeki 32px'lik bir trend çizgisi için 95 kB'lik bir
 * motoru sayfaya sokmak olurdu.
 */

/** Stat/KPI kartı içine gömülen mini trend — eksen yok, yalnız şekil. */
export function Sparkline({
  values,
  tone = "brand",
  height = 32,
  label,
  area = true,
  className,
}: {
  values: number[];
  tone?: "brand" | "success" | "danger" | "neutral";
  height?: number;
  label: string;
  /** Çizginin altını hafifçe doldurur — kartta yön okumayı kolaylaştırır. */
  area?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;

  const width = 120;
  const max = Math.max(...values);
  const min = Math.min(...values);

  /**
   * Düz seri çizilmez.
   *
   * `span` sıfır olduğunda her nokta `height - 2`'ye düşüyor ve kartın alt
   * kenarına yapışık düz bir çizgi çıkıyordu — tarayıcıda ölçüldü: sıfır
   * tahsilatlı bir sitede "trend" gibi görünen şey aslında bir cetveldi.
   * Değişim yoksa gösterilecek trend de yok; kart sayıyla kalır.
   */
  if (max === min) return null;

  const span = max - min;
  const point = (value: number, i: number) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const points = values.map(point).join(" ");

  const stroke =
    tone === "success"
      ? "var(--color-success)"
      : tone === "danger"
        ? "var(--color-danger)"
        : tone === "neutral"
          ? "var(--color-fg-subtle)"
          : "var(--color-chart-1)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {area ? (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={stroke}
          opacity={0.12}
        />
      ) : null}
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

export interface BulletRow {
  key: string;
  label: string;
  /** Gerçekleşen değer. */
  value: number;
  /** Hedef değer — aynı birimde. */
  target: number;
  /** Ölçek üst sınırı; verilmezse satırdaki en büyük değerden türetilir. */
  max?: number;
}

/**
 * Bullet grafiği — "hedefe karşı gerçekleşen".
 *
 * Gösterge (gauge) yerine bullet: aynı bilgiyi satır yüksekliğinde verir,
 * yan yana birden çok ölçü karşılaştırılabilir ve hedef **çizgi** olduğu için
 * "geçtim mi / geçmedim mi" sorusu tek bakışta cevaplanır. Renk tek başına
 * kimlik taşımaz; her satırda değer, hedef ve durum yazıyla da yazılır.
 */
export function BulletChart({
  rows,
  formatValue,
  targetLabel,
  aboveTargetLabel,
  belowTargetLabel,
}: {
  rows: BulletRow[];
  formatValue: (value: number) => string;
  targetLabel: string;
  aboveTargetLabel: string;
  belowTargetLabel: string;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const max = Math.max(row.max ?? 0, row.value, row.target) || 1;
        const valuePct = Math.min(100, (row.value / max) * 100);
        const targetPct = Math.min(100, (row.target / max) * 100);
        const met = row.value >= row.target;

        return (
          <li key={row.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium text-fg">{row.label}</span>
              <span className="text-sm font-semibold tabular-nums text-fg">
                {formatValue(row.value)}
                <span className="ml-2 text-xs font-normal text-fg-subtle">
                  {targetLabel} {formatValue(row.target)}
                </span>
              </span>
            </div>

            <div className="relative mt-1.5 h-3 rounded-full bg-surface-sunken">
              {/* Hedefe kadar olan bölge — "yeterli" bandı geri planda. */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-full bg-hover"
                style={{ width: `${targetPct}%` }}
              />
              <div
                aria-hidden
                className={cn(
                  "absolute inset-y-0.5 left-0 rounded-full",
                  met ? "bg-success" : "bg-warning",
                )}
                style={{ width: `${valuePct}%` }}
              />
              {/* Hedef işareti: renk körlüğünde de okunabilsin diye çizgi. */}
              <div
                aria-hidden
                className="absolute -inset-y-0.5 w-0.5 rounded-full bg-fg"
                style={{ left: `calc(${targetPct}% - 1px)` }}
              />
            </div>

            <p
              className={cn(
                "mt-1 text-[11px] font-medium",
                met ? "text-success-fg" : "text-warning-fg",
              )}
            >
              {met ? aboveTargetLabel : belowTargetLabel}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
