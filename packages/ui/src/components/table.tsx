import type { ReactNode } from "react";

import { cn } from "../cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyText,
  footer,
  caption,
  minWidth = 560,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText: string;
  footer?: ReactNode;
  caption?: string;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-3 py-2 font-medium",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-fg-subtle">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-hover">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2.5 align-middle text-fg",
                      c.align === "right" && "text-right tabular-nums",
                      c.align === "center" && "text-center",
                      c.className,
                    )}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}

/** Ham `<table>` kullanan ekranlar için ortak sınıflar. */
export const tableClasses = {
  wrapper: "overflow-x-auto",
  table: "w-full border-collapse text-sm",
  thead: "border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle",
  th: "px-4 py-2 font-medium",
  tr: "border-b border-border last:border-0",
  td: "px-4 py-2.5 text-fg",
  tdMuted: "px-4 py-2.5 text-fg-muted",
  tdNum: "px-4 py-2.5 text-right tabular-nums text-fg",
  empty: "px-4 py-8 text-center text-fg-subtle",
} as const;
