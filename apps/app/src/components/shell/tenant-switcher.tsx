"use client";

import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { switchTenant } from "@/app/panel/portfoy/actions";

/**
 * Site değiştirici — kabuğun marka başlığında.
 *
 * NEDEN VAR: `ctx.memberships` ve `switchTenant()` baştan beri yazılıydı ama
 * hiçbir uca ve hiçbir ekrana bağlı değildi. Birden fazla site yöneten bir
 * kullanıcı, sitesini değiştirmek için çıkış yapıp yeniden girmek zorundaydı.
 *
 * Tek üyeliği olan kullanıcıda hiç render edilmiyor (`AppShell` karar veriyor):
 * seçeneksiz bir seçici, gürültüden başka bir şey değil.
 */
export function TenantSwitcher({
  current,
  memberships,
  labels,
}: {
  current: { id: string; name: string };
  memberships: { id: string; slug: string; name: string }[];
  labels: { trigger: string; portfolio: string; status: string };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dışarı tıklayınca kapan. Radix Popover'a taşınabilir ama bu menü tek
  // parça ve odak tuzağı istemiyor; ESC + dışarı tıklama yeterli.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={labels.trigger}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-fg">
            {current.name}
          </span>
          <span className="mt-0.5 block text-[11px] leading-tight text-fg-subtle">
            {labels.status}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          <ul className="max-h-72 overflow-y-auto py-1">
            {memberships.map((membership) => (
              <li key={membership.id}>
                {membership.id === current.id ? (
                  <span
                    role="menuitem"
                    aria-current="true"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-fg"
                  >
                    <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{membership.name}</span>
                  </span>
                ) : (
                  <form action={switchTenant}>
                    <input type="hidden" name="tenantId" value={membership.id} />
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg-muted hover:bg-hover hover:text-fg"
                    >
                      <span className="h-4 w-4 shrink-0" />
                      <span className="truncate">{membership.name}</span>
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>

          <Link
            href="/panel/portfoy"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm font-medium text-primary hover:bg-hover"
          >
            <LayoutGrid aria-hidden className="h-4 w-4 shrink-0" />
            {labels.portfolio}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
