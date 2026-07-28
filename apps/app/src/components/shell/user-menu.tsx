"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@yonetim/ui";

import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Kullanıcı menüsü — üst barın sağ ucu.
 *
 * NEDEN: bar yedi ayrı denetim taşıyordu (rozet, zil, kullanıcı adı, rol
 * etiketi, dil seçici, erişilebilirlik, tema, çıkış). 1280px'in altında
 * bunlar birbirine giriyor, mobilde yarısı gizleniyordu — yani tercih
 * ekranda vardı ama ulaşılamıyordu. Kimliğe bağlı olanlar (ad, rol, dil,
 * çıkış) tek bir menüde toplandı; barda kalanlar bağlamdan bağımsız olanlar.
 *
 * Çıkış hâlâ gerçek bir `<form method="post">`: JS gelmese de çalışır ve
 * CSRF açısından GET bağlantısından farkı önemli.
 */
export function UserMenu({
  userName,
  roleLabel,
  labels,
}: {
  userName: string;
  roleLabel?: string;
  labels: { trigger: string; logout: string };
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={labels.trigger}
        title={userName}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong pl-1 pr-2 transition-colors hover:bg-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-hover",
        )}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-xs font-bold text-primary-soft-fg"
        >
          {initials(userName)}
        </span>
        <span className="hidden max-w-32 truncate text-sm text-fg-muted xl:inline">
          {userName}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-60 rounded-lg border border-border bg-surface-raised p-3 shadow-lg">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{userName}</div>
            {roleLabel ? (
              <div className="mt-0.5 text-xs text-fg-subtle">{roleLabel}</div>
            ) : null}
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <LocaleSwitcher className="w-full justify-center" />
          </div>

          <form action="/api/oturum/cikis" method="post" className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg hover:bg-hover"
            >
              <LogOut aria-hidden className="h-4 w-4" />
              {labels.logout}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Ad-soyaddan iki harf; tek kelimelik adlarda ilk iki harf. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase("tr-TR");
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase("tr-TR");
}
