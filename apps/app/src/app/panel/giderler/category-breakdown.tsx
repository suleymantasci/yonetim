"use client";

import { seriesColor } from "@yonetim/ui";

/**
 * Kategori kırılımı — yatay sütun.
 *
 * Kategori adları uzun olduğu için dikey sütun yerine yatay tercih edildi:
 * etiketler döndürülmeden okunuyor. Her satır **doğrudan etiketli** (tutar
 * yanında yazılı), böylece kimlik yalnız renkle taşınmıyor — açık temada bazı
 * seri renkleri 3:1 kontrastın altında kalıyor ve bu kural zorunlu.
 */
export function CategoryBreakdown({
  rows,
  emptyText,
}: {
  rows: { name: string; amountKurus: number; amountLabel: string }[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-fg-subtle">{emptyText}</p>
    );
  }

  const max = Math.max(...rows.map((row) => row.amountKurus), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row, index) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-fg">{row.name}</span>
            <span className="shrink-0 font-medium tabular-nums text-fg">
              {row.amountLabel}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.amountKurus / max) * 100}%`,
                backgroundColor: seriesColor(index),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
