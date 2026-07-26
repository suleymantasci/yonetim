"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from "react";

import { cn } from "../cn";

/**
 * Toast altyapısı — GAP 4.6.1.
 *
 * Sonner yerine elle yazıldı: ihtiyacımız olan yığın + otomatik kapanma +
 * geri al aksiyonu üçlüsü ~120 satır tutuyor, harici bağımlılık gerekmiyor.
 *
 * Erişilebilirlik: bölge `aria-live="polite"`, hata tonunda `assertive`.
 * Otomatik kapanma fare üzerindeyken durur (okuma süresi yetmeyebilir).
 */

export type ToastTone = "success" | "danger" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** ms; 0 → kendiliğinden kapanmaz. */
  duration?: number;
  action?: ToastAction;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

interface ToastApi {
  toast: (options: ToastOptions) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TONES: Record<ToastTone, string> = {
  success: "border-success-border bg-success-soft text-success-fg",
  danger: "border-danger-border bg-danger-soft text-danger-fg",
  warning: "border-warning-border bg-warning-soft text-warning-fg",
  info: "border-info-border bg-info-soft text-info-fg",
};

export function ToastProvider({
  children,
  closeLabel = "Kapat",
}: {
  children: ReactNode;
  closeLabel?: string;
}) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, duration: number) => {
      if (duration <= 0) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => {
    const toast = (options: ToastOptions) => {
      const id = ++seq.current;
      const duration = options.duration ?? (options.tone === "danger" ? 8000 : 4000);
      // En fazla 4 toast tut; eskisi düşer, ekran dolmaz.
      setItems((current) => [...current.slice(-3), { ...options, id, duration }]);
      schedule(id, duration);
      return id;
    };
    return {
      toast,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "danger" }),
      dismiss,
    };
  }, [dismiss, schedule]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-end gap-2 p-4 sm:left-auto sm:right-0 sm:w-96"
        role="region"
        aria-label="Bildirimler"
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone ?? "info"];
          return (
            <div
              key={item.id}
              role={item.tone === "danger" ? "alert" : "status"}
              aria-live={item.tone === "danger" ? "assertive" : "polite"}
              onMouseEnter={() => {
                const timer = timers.current.get(item.id);
                if (timer) clearTimeout(timer);
              }}
              onMouseLeave={() => schedule(item.id, item.duration ?? 4000)}
              className={cn(
                "pointer-events-auto w-full rounded-lg border p-3 shadow-lg",
                "motion-safe:animate-[overlay-slide-right_160ms_ease-out]",
                TONES[item.tone ?? "info"],
              )}
            >
              <div className="flex items-start gap-2">
                <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{item.title}</div>
                  {item.description ? (
                    <div className="mt-0.5 text-xs opacity-90">{item.description}</div>
                  ) : null}
                  {item.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        item.action?.onClick();
                        dismiss(item.id);
                      }}
                      className="mt-2 rounded border border-current/30 px-2 py-1 text-xs font-semibold hover:bg-current/10"
                    >
                      {item.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label={closeLabel}
                  className="-m-1 rounded p-1 opacity-70 hover:opacity-100"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Toast API'si. Sağlayıcı dışında çağrılırsa sessizce yutar (no-op) —
 * bir bileşenin sırf bildirim gösteremediği için patlaması istenmez.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  return (
    ctx ?? {
      toast: () => 0,
      success: () => 0,
      error: () => 0,
      dismiss: () => undefined,
    }
  );
}
