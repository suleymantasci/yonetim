import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Zaman çizelgesi — VURUCU ÖZELLİK görselleştirmesi (SPEC 3.2, GAP 5.2).
 *
 * Aidat değişikliği tarihçesi buradan çizilir: eski tutar → yeni tutar,
 * değiştiren kişi, tarih ve **gerekçe**. Rakiplerin en büyük şikâyeti olan
 * "geriye dönük sessiz zam" bu ekranla imkânsızlaşır; kayıtlar append-only
 * tablodan gelir (`audit_debt_changes`), UI hiçbir şeyi gizlemez.
 */

export type TimelineTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const DOT: Record<TimelineTone, string> = {
  neutral: "bg-border-strong",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  brand: "bg-primary",
};

export interface TimelineEntry {
  id: string;
  title: ReactNode;
  timestamp: string;
  actor?: string;
  tone?: TimelineTone;
  /** Değer değişimi (eski → yeni). */
  delta?: { from: ReactNode; to: ReactNode };
  reason?: string;
  meta?: ReactNode;
}

export function Timeline({
  entries,
  emptyText,
  reasonLabel,
  actorLabel,
}: {
  entries: TimelineEntry[];
  emptyText: string;
  reasonLabel: string;
  actorLabel: string;
}) {
  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-subtle">{emptyText}</p>;
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
          {/* Dikey bağlantı çizgisi — son öğede çizilmez. */}
          {index < entries.length - 1 ? (
            <span aria-hidden className="absolute left-[7px] top-4 h-full w-px bg-border" />
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-surface",
              DOT[entry.tone ?? "neutral"],
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-fg">{entry.title}</span>
              <time className="text-xs tabular-nums text-fg-subtle">{entry.timestamp}</time>
            </div>

            {entry.delta ? (
              <div className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-sunken px-2.5 py-1.5 text-sm">
                <span className="text-fg-muted line-through tabular-nums">{entry.delta.from}</span>
                <span aria-hidden className="text-fg-subtle">→</span>
                <span className="font-semibold tabular-nums text-fg">{entry.delta.to}</span>
              </div>
            ) : null}

            {entry.actor ? (
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-fg-subtle">{actorLabel}:</span> {entry.actor}
              </p>
            ) : null}

            {entry.reason ? (
              <p className="mt-1 text-xs text-fg-muted">
                <span className="text-fg-subtle">{reasonLabel}:</span> {entry.reason}
              </p>
            ) : null}

            {entry.meta ? <div className="mt-1.5">{entry.meta}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Aşama göstergesi (icra takibi 8 aşama, talep durum akışı, göç sihirbazı).
 * Yatay; mobilde dikey akar.
 */
export function StageTracker({
  stages,
  currentIndex,
  label,
}: {
  stages: { key: string; label: string; hint?: string }[];
  currentIndex: number;
  label: string;
}) {
  return (
    <ol aria-label={label} className="grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
      {stages.map((stage, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={stage.key}
            aria-current={active ? "step" : undefined}
            className={cn(
              "rounded-lg border p-3",
              done && "border-success-border bg-success-soft",
              active && "border-primary bg-primary-soft",
              !done && !active && "border-border bg-surface",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  done && "bg-success text-primary-fg",
                  active && "bg-primary text-primary-fg",
                  !done && !active && "bg-surface-sunken text-fg-subtle",
                )}
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  done && "text-success-fg",
                  active && "text-primary-soft-fg",
                  !done && !active && "text-fg-muted",
                )}
              >
                {stage.label}
              </span>
            </div>
            {stage.hint ? <p className="mt-1 text-[11px] text-fg-subtle">{stage.hint}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
