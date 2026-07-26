import type { ReactNode } from "react";

import { cn } from "../cn";

const TONES = {
  info: "border-info-border bg-info-soft text-info-fg",
  success: "border-success-border bg-success-soft text-success-fg",
  warning: "border-warning-border bg-warning-soft text-warning-fg",
  danger: "border-danger-border bg-danger-soft text-danger-fg",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn("rounded-lg border p-3 text-sm", TONES[tone])}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
