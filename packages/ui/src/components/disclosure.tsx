import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Akordiyon — `<details>`/`<summary>` üzerine kurulu **sunucu bileşeni**.
 *
 * NEDEN NATIVE: Bir SSS listesi, açılıp kapanmak için JavaScript beklememeli.
 * `<details>` klavye erişimini, `aria-expanded` semantiğini ve tarayıcının
 * "sayfa içinde bul" davranışını (kapalı içeriği bulunca açar) kendiliğinden
 * getiriyor — elle yazılan bir akordiyonda bunların üçü de kaybediliyor.
 *
 * Arama motoru açısından da önemli: içerik DOM'da, `FAQPage` yapısal verisiyle
 * birebir aynı metin. Gizleme yalnız görsel.
 *
 * Yükseklik geçişi `tokens.css` içinde `::details-content` ile, destekleyen
 * tarayıcılarda ilerici zenginleştirme olarak veriliyor; desteklemeyende
 * akordiyon anında açılır — bozulma değil, sadelik.
 */

export interface AccordionProps {
  children: ReactNode;
  className?: string;
}

export function Accordion({ children, className }: AccordionProps) {
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-card border border-border bg-surface", className)}>
      {children}
    </div>
  );
}

export interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Aynı ada sahip öğelerden yalnız biri açık kalır (tarayıcı yönetir). */
  name?: string;
  className?: string;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  name,
  className,
}: AccordionItemProps) {
  return (
    <details open={defaultOpen} name={name} className={cn("group", className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4",
          "text-left font-medium text-fg transition-colors hover:bg-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Safari ve Chrome'un varsayılan üçgenini kaldır.
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        {title}
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="px-5 pb-5 pt-0 text-sm leading-relaxed text-fg-muted">{children}</div>
    </details>
  );
}
