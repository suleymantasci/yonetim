"use client";

import { Children, type CSSProperties, type ReactNode } from "react";

import { cn } from "../cn";

/**
 * Sonsuz yatay şerit (logo bandı, entegrasyon listesi).
 *
 * NEDEN JS YOK: sabit hızda kayan bir şerit için kare kare hesap gereksiz;
 * `@keyframes marquee` bunu bileşik katmanda (transform) yapıyor ve ana iş
 * parçacığını hiç meşgul etmiyor. Kütüphane yalnız duruma bağlı hareket için.
 *
 * HAREKET AZALTMA — iki kanal da kapanır:
 *   · sistem tercihi → `motion-safe:` varyantı animasyonu hiç uygulamaz,
 *   · çerez tercihi  → `tokens.css` içindeki `[data-motion="reduced"]` kuralı
 *     süreyi 0.01ms'ye indirir.
 * Her iki durumda şerit ilk karesinde durur; içerik görünür kalır, kaybolmaz.
 *
 * ERİŞİLEBİLİRLİK: içerik iki kez basılır (kesintisiz döngü için gerekli),
 * ikinci kopya `aria-hidden` — yoksa ekran okuyucu listeyi iki defa okurdu.
 */

export interface MarqueeProps {
  children: ReactNode;
  /** Bir turun süresi. Eleman sayısı arttıkça uzatın ki hız sabit kalsın. */
  durationSeconds?: number;
  className?: string;
}

export function Marquee({ children, durationSeconds = 42, className }: MarqueeProps) {
  const items = Children.toArray(children);

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        // Kenarda sert kesim yerine zemine karışarak bitiş.
        "[mask-image:linear-gradient(90deg,transparent,black_9%,black_91%,transparent)]",
        className,
      )}
    >
      <div
        className="flex w-max motion-safe:animate-[marquee_var(--marquee-duration)_linear_infinite]"
        style={{ "--marquee-duration": `${durationSeconds}s` } as CSSProperties}
      >
        <ul className="flex shrink-0 items-center gap-12 pe-12">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
        <ul aria-hidden className="flex shrink-0 items-center gap-12 pe-12">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
