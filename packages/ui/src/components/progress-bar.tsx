import { cn } from "../cn";

/** Oran göstergesi — kategori dağılımı, tahsilat oranı gibi yerlerde. */
export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fill = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded bg-surface-sunken", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded transition-[width]", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
