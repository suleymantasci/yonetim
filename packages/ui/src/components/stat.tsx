import type { ReactNode } from "react";

import { cn } from "../cn";

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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-fg-muted">{label}</span>
        {icon ? (
          <span aria-hidden className="text-fg-subtle">
            {icon}
          </span>
        ) : null}
      </div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums", VALUE_TONE[tone])}>{value}</div>
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
