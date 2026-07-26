"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "../cn";
import {
  THEME_COOKIE,
  THEME_COOKIE_OPTIONS,
  THEME_PREFERENCES,
  type ThemePreference,
} from "./theme";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export interface ThemeToggleLabels {
  /** Grup etiketi, örn. "Tema" */
  group: string;
  light: string;
  dark: string;
  system: string;
}

/**
 * Üç durumlu tema seçici — SPEC Bölüm 11.3.
 *
 * Erişilebilirlik: `radiogroup` semantiği kullanılır; klavye ile ok tuşlarıyla
 * gezinilir ve seçim `aria-checked` ile duyurulur (WCAG 2.1 AA — Bölüm 11.5).
 * Etiketler dışarıdan verilir, böylece bileşen dile bağımsız kalır.
 */
export function ThemeToggle({
  initialPreference,
  labels,
  className,
}: {
  initialPreference: ThemePreference;
  labels: ThemeToggleLabels;
  className?: string;
}) {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  // Sistem tercihi seçiliyken işletim sistemi teması değişirse canlı yansıt.
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme("system");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  function select(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    persist(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={labels.group}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-sunken p-0.5",
        className,
      )}
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        const active = preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            title={labels[option]}
            onClick={() => select(option)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              active
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-subtle hover:bg-hover hover:text-fg",
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            <span className="sr-only">{labels[option]}</span>
          </button>
        );
      })}
    </div>
  );
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;

  // Geçiş animasyonunu yalnızca kullanıcı eylemi sırasında aç; ilk yüklemede
  // gereksiz animasyon olmasın.
  root.setAttribute("data-theme-transition", "");
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-preference", preference);
  root.style.colorScheme = resolved;
  window.setTimeout(() => root.removeAttribute("data-theme-transition"), 220);
}

function persist(preference: ThemePreference) {
  const { maxAge, path, sameSite } = THEME_COOKIE_OPTIONS;
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(preference)}; path=${path}; max-age=${maxAge}; samesite=${sameSite}`;
}
