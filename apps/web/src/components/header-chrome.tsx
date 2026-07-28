"use client";

import { Menu } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Drawer } from "@yonetim/ui";

import { usePathname } from "@/i18n/navigation";

/**
 * Başlığın etkileşimli kabuğu.
 *
 * NEDEN VAR: Önceki başlıkta `lg` altında navigasyon **tamamen kayboluyordu** —
 * telefonda siteyi gezmenin hiçbir yolu yoktu. Bu bir stil eksiği değil,
 * işlevsel bir hataydı.
 *
 * SUNUCU/İSTEMCİ AYRIMI: Bağlantıların kendisi ve etiketleri sunucuda üretilip
 * `children` olarak geçiliyor. Böylece pazarlama çeviri paketinin istemciye
 * gönderilmesi gerekmiyor (`tests/i18n-client.test.ts` yalnız `common`
 * namespace'ine izin veriyor) ve menü içeriği HTML'de duruyor.
 *
 * KAYDIRMA DURUMU: `scroll` dinleyicisi yerine başlığın hemen üstüne konan bir
 * gözcü öğe ve `IntersectionObserver`. Kaydırma dinleyicisi her karede çalışıp
 * ana iş parçacığını meşgul ederdi; gözcü yalnız eşiği geçerken bir kez ateşler.
 */

export interface HeaderChromeProps {
  brand: ReactNode;
  nav: ReactNode;
  actions: ReactNode;
  mobilePanel: ReactNode;
  labels: { menu: string; close: string };
}

export function HeaderChrome({ brand, nav, actions, mobilePanel, labels }: HeaderChromeProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry?.isIntersecting),
      { threshold: 1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Menüden bir bağlantıya gidilince panel kapanmalı; yoksa yeni sayfa
  // menünün arkasında açılıyor.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div ref={sentinel} aria-hidden className="absolute top-0 h-px w-full" />
      <header
        data-scrolled={scrolled ? "" : undefined}
        className={
          "sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-200 " +
          "border-transparent bg-canvas/80 backdrop-blur-md " +
          "data-[scrolled]:border-border data-[scrolled]:bg-surface/90 data-[scrolled]:shadow-sm"
        }
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="shrink-0">{brand}</div>

          <nav className="hidden items-center gap-0.5 lg:flex">{nav}</nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={labels.menu}
              aria-expanded={open}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
            >
              <Menu aria-hidden className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={labels.menu}
        closeLabel={labels.close}
        size="sm"
      >
        {mobilePanel}
      </Drawer>
    </>
  );
}
