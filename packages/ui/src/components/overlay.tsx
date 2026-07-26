"use client";

import { X } from "lucide-react";
import {
  useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode,
} from "react";

import { cn } from "../cn";

/**
 * Overlay ailesi — SPEC Bölüm 11.4, GAP 4.4.5.
 *
 * Modal / Drawer / Sheet üçlüsü tek bir ilkelden türer: aynı odak tuzağı,
 * aynı ESC davranışı, aynı backdrop. Radix yerine elle yazıldı; tek ihtiyacımız
 * olan davranışlar bunlar ve bundle politikası (GAP 7.2) harici lib istemiyor.
 *
 * Erişilebilirlik:
 * - `role="dialog"` + `aria-modal` + başlığa `aria-labelledby`
 * - Odak açılışta panele girer, kapanışta tetikleyen öğeye döner
 * - Tab/Shift+Tab panel içinde döner (focus trap)
 * - ESC ve backdrop tıklaması kapatır (`dismissible={false}` ile kilitlenir)
 * - `prefers-reduced-motion` altında animasyon devre dışı (globals.css)
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type OverlayVariant = "modal" | "drawer" | "sheet";

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** modal = ortada, drawer = sağdan, sheet = alttan. */
  variant?: OverlayVariant;
  size?: "sm" | "md" | "lg" | "xl";
  dismissible?: boolean;
  closeLabel?: string;
  className?: string;
}

const PANEL: Record<OverlayVariant, string> = {
  modal:
    "relative m-auto w-full rounded-xl border border-border bg-surface shadow-xl " +
    "motion-safe:animate-[overlay-zoom_150ms_ease-out]",
  drawer:
    "relative ml-auto flex h-full w-full flex-col border-l border-border bg-surface shadow-xl " +
    "motion-safe:animate-[overlay-slide-right_180ms_ease-out]",
  sheet:
    "relative mt-auto flex max-h-[90dvh] w-full flex-col rounded-t-2xl border-t border-border " +
    "bg-surface shadow-xl motion-safe:animate-[overlay-slide-up_180ms_ease-out]",
};

const SIZE: Record<NonNullable<OverlayProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  size = "md",
  dismissible = true,
  closeLabel = "Kapat",
  className,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Açılışta odağı panele taşı, kapanışta tetikleyene geri ver.
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    return () => returnFocusRef.current?.focus?.();
  }, [open]);

  // Arka plan kaydırmasını kilitle.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-overlay p-0 motion-safe:animate-[overlay-fade_120ms_ease-out]",
        variant === "modal" && "items-center justify-center p-4",
      )}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          PANEL[variant],
          variant === "modal" && SIZE[size],
          variant === "drawer" && (size === "xl" ? "max-w-2xl" : SIZE[size]),
          "outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-m-1 rounded-lg p-1 text-fg-subtle hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div
          className={cn(
            "p-4",
            variant === "modal" ? "max-h-[70dvh] overflow-y-auto" : "flex-1 overflow-y-auto",
          )}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-sunken p-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Modal(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="modal" />;
}

export function Drawer(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="drawer" />;
}

export function Sheet(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="sheet" />;
}

/**
 * Yıkıcı işlem onayı. Silme/iptal gibi geri dönüşü zor akışlarda
 * doğrudan `Modal` kurmak yerine bu kullanılır ki metin/ton tutarlı kalsın.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeLabel={cancelLabel}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50",
              tone === "danger"
                ? "bg-danger text-primary-fg hover:brightness-95"
                : "bg-primary text-primary-fg hover:bg-primary-hover",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">{description}</p>
    </Modal>
  );
}
