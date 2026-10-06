import type { ReactNode } from "react";

import { cn } from "../cn";
import { Sparkline } from "./chart/primitives";
import type { LinkLike } from "./navigation";

export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { value: number; label?: string };
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}

const VALUE_TONE: Record<NonNullable<StatProps["tone"]>, string> = {
  neutral: "text-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

export function Stat({ label, value, hint, trend, icon, tone = "neutral" }: StatProps) {
  return (
    <div className="stat-card min-w-0 rounded-xl border border-border bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-muted sm:text-sm">{label}</span>
        {icon ? (
          <span aria-hidden className="text-fg-subtle">
            {icon}
          </span>
        ) : null}
      </div>
      <div className={cn("stat-value mt-1.5 text-lg font-bold tabular-nums [overflow-wrap:anywhere] sm:mt-2 sm:text-2xl", VALUE_TONE[tone])}>{value}</div>
      {hint || trend ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          {trend ? (
            <span className={trend.value >= 0 ? "text-success-fg" : "text-danger-fg"}>
              <span aria-hidden>{trend.value >= 0 ? "▲" : "▼"}</span> %
              {Math.abs(trend.value).toFixed(1)}
              {trend.label ? ` ${trend.label}` : ""}
            </span>
          ) : null}
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/**
 * KPI kartı — `Stat`'ın trend gösteren büyük kardeşi.
 *
 * Üç şey `Stat`'tan farklı ve üçü de bilinçli:
 *  · **Gömülü sparkline.** Tek sayı "yüksek mi alçak mı" sorusunu
 *    cevaplamıyor; on iki aylık şekil cevaplıyor. `Sparkline` `packages/ui`'de
 *    zaten vardı ama **hiçbir yerde kullanılmıyordu** (Faz 3 hata listesi #8);
 *    yeri burasıydı. Motorsuz olduğu için (tek `<svg>`) kart sunucuda
 *    render edilmeye devam ediyor.
 *  · **Delta yönü renkle DEĞİL, okla + yazıyla taşınır.** Kırmızı/yeşil tek
 *    başına renk körlüğünde okunmaz; ok yönü ve "geçen aya göre" metni
 *    kimliği taşır, renk yalnız pekiştirir.
 *  · **Yönün iyi mi kötü mü olduğu çağırana ait.** Borçta artış kötü,
 *    tahsilatta iyi. `positiveIsGood={false}` ile ters çevrilir; bileşen
 *    kendi başına karar vermez — verseydi "gider %20 arttı" yeşil çıkardı.
 */
export interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: NonNullable<StatProps["tone"]>;
  /** Önceki döneme göre değişim; `formatted` locale'e uygun hazır metin. */
  delta?: { ratio: number; formatted: string; label?: string };
  /** Artış iyi mi? Borç/gider gibi ölçülerde `false`. */
  positiveIsGood?: boolean;
  /** Kart içine gömülen trend — en az iki nokta. */
  trend?: { values: number[]; label: string };
  href?: string;
  linkComponent?: LinkLike;
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  delta,
  positiveIsGood = true,
  trend,
  href,
  linkComponent: Link,
}: KpiCardProps) {
  const good = delta ? delta.ratio >= 0 === positiveIsGood : undefined;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-fg-muted sm:text-sm">{label}</span>
        {icon ? (
          <span aria-hidden className="shrink-0 text-fg-subtle">
            {icon}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "stat-value mt-2 font-heading text-xl font-extrabold leading-none tabular-nums [overflow-wrap:anywhere] sm:text-[1.75rem]",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </div>

      {delta || hint ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold",
                good ? "bg-success-soft text-success-fg" : "bg-danger-soft text-danger-fg",
              )}
            >
              <span aria-hidden>{delta.ratio >= 0 ? "↑" : "↓"}</span>
              {delta.formatted}
            </span>
          ) : null}
          {delta?.label ? <span>{delta.label}</span> : null}
          {hint}
        </div>
      ) : null}

      {trend && trend.values.length > 1 ? (
        <div className="mt-4">
          <Sparkline
            values={trend.values}
            label={trend.label}
            height={34}
            tone={tone === "neutral" ? "brand" : tone === "warning" ? "danger" : tone}
          />
        </div>
      ) : null}
    </>
  );

  const shell = "block stat-card min-w-0 rounded-xl border border-border bg-surface p-3 shadow-sm transition-colors sm:p-4";

  if (href && Link) {
    return (
      <Link href={href} className={cn(shell, "hover:border-border-strong hover:bg-hover")}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
