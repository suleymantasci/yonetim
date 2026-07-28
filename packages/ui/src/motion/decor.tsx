"use client";

import type { PointerEvent, ReactNode } from "react";

import { cn } from "../cn";

/**
 * Dekoratif zemin ve imleç etkileşimleri.
 *
 * Hepsi `aria-hidden` veya salt görsel: hiçbiri bilgi taşımaz. Bu kural
 * bilerek katı — bir kullanıcı hareketi kapattığında sayfadan bilgi eksilmesi
 * kabul edilemez, yalnız cila eksilebilir.
 */

/**
 * Yumuşak gradyan zemin. Üç bulanık leke; marka renklerinden türetilir,
 * çok yavaş sürüklenir. `blur` yerine büyük `radial-gradient` kullanıldı:
 * filtre, altındaki metnin alt piksel düzleştirmesini bozuyordu.
 */
export function GradientMesh({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute -left-[20%] -top-[60%] h-[75rem] w-[75rem] rounded-full motion-safe:animate-[gradient-drift_26s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 42%, transparent) 0%, transparent 58%)",
        }}
      />
      <div
        className="absolute -right-[22%] -top-[45%] h-[62rem] w-[62rem] rounded-full motion-safe:animate-[gradient-drift_34s_ease-in-out_infinite_reverse]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-secondary) 34%, transparent) 0%, transparent 56%)",
        }}
      />
      <div
        className="absolute -bottom-[55%] left-[22%] h-[55rem] w-[55rem] rounded-full motion-safe:animate-[gradient-drift_30s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-accent) 26%, transparent) 0%, transparent 58%)",
        }}
      />
    </div>
  );
}

/**
 * İmleci izleyen yumuşak ışık — kart hover'ı.
 *
 * Konum React state'ine yazılmaz: her fare hareketi bir render tetikler ve
 * 120 Hz'lik bir farede bu tek başına ana iş parçacığını doldurur. Bunun
 * yerine iki CSS özel özelliği doğrudan öğeye yazılıyor; boyama dışında
 * hiçbir iş yapılmıyor.
 *
 * Yalnız ince imleçte (fare) görünür: dokunmatik ekranda "hover" diye bir
 * durum yok, orada ışık parmağın altında kalıp kafa karıştırıyor.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - box.top}px`);
  }

  return (
    <div className={cn("group relative", className)} onPointerMove={handlePointerMove}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(pointer:coarse)]:hidden"
        style={{
          background:
            "radial-gradient(22rem circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 72%)",
        }}
      />
      {children}
    </div>
  );
}
