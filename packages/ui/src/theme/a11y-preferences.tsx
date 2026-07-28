"use client";

import { Accessibility } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import {
  A11Y_COOKIE,
  DENSITIES,
  FONT_SCALES,
  serializeA11y,
  type A11yPreferences,
  type Density,
  type FontScale,
} from "./a11y";

/**
 * Erişilebilirlik tercih menüsü — GAP 4.7.1 / SPEC 11.5.
 *
 * Saf model (çerez biçimi, parse/serialize, init betiği) `./a11y` içinde
 * durur; sunucu bileşenleri oradan içe aktarır. Burada yalnızca istemci
 * tarafı etkileşim vardır.
 *
 * Hareket tercihi işletim sistemi ayarını **ezmez, yalnız güçlendirir**:
 * OS "reduce" diyorsa kullanıcı buradan açsa da animasyon kapalı kalır.
 */

function apply(preferences: A11yPreferences): void {
  const root = document.documentElement;
  root.setAttribute("data-font-scale", preferences.fontScale);
  if (preferences.highContrast) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
  if (preferences.reducedMotion) root.setAttribute("data-motion", "reduced");
  else root.removeAttribute("data-motion");
  if (preferences.density === "compact") root.setAttribute("data-density", "compact");
  else root.removeAttribute("data-density");
  document.cookie = `${A11Y_COOKIE}=${encodeURIComponent(serializeA11y(preferences))};path=/;max-age=${
    60 * 60 * 24 * 365
  };samesite=lax`;
}

export function A11yMenu({
  initial,
  labels,
}: {
  initial: A11yPreferences;
  labels: {
    trigger: string;
    fontSize: string;
    scale: Record<FontScale, string>;
    highContrast: string;
    reducedMotion: string;
    density: string;
    densityOption: Record<Density, string>;
  };
}) {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(initial);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function update(patch: Partial<A11yPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    apply(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={labels.trigger}
        title={labels.trigger}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong text-fg-muted hover:bg-hover hover:text-fg"
      >
        <Accessibility aria-hidden className="h-4 w-4" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-3 shadow-lg">
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {labels.fontSize}
            </legend>
            <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label={labels.fontSize}>
              {FONT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  role="radio"
                  aria-checked={preferences.fontScale === scale}
                  onClick={() => update({ fontScale: scale })}
                  className={cn(
                    "rounded border py-1.5 text-xs font-semibold",
                    preferences.fontScale === scale
                      ? "border-primary bg-primary-soft text-primary-soft-fg"
                      : "border-border text-fg-muted hover:bg-hover",
                  )}
                >
                  {labels.scale[scale]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-3 border-t border-border pt-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {labels.density}
            </legend>
            <div
              className="mt-2 grid grid-cols-2 gap-1"
              role="radiogroup"
              aria-label={labels.density}
            >
              {DENSITIES.map((density) => (
                <button
                  key={density}
                  type="button"
                  role="radio"
                  aria-checked={preferences.density === density}
                  onClick={() => update({ density })}
                  className={cn(
                    "rounded border py-1.5 text-xs font-semibold",
                    preferences.density === density
                      ? "border-primary bg-primary-soft text-primary-soft-fg"
                      : "border-border text-fg-muted hover:bg-hover",
                  )}
                >
                  {labels.densityOption[density]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              {labels.highContrast}
              <input
                type="checkbox"
                checked={preferences.highContrast}
                onChange={(event) => update({ highContrast: event.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              {labels.reducedMotion}
              <input
                type="checkbox"
                checked={preferences.reducedMotion}
                onChange={(event) => update({ reducedMotion: event.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
