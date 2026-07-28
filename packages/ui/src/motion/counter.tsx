"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "../cn";
import { useReducedMotionPreference } from "./motion-provider";

/**
 * Sayı sayan gösterge.
 *
 * SUNUCUDA SON DEĞER RENDER EDİLİR. İki nedeni var: JS gelmezse sayfada doğru
 * rakam durur (pazarlama sayfaları SSG), ve arama motoru "0" değil gerçek
 * değeri görür. Sayım istemcide, boyamadan önce başlangıcı düşürerek başlar —
 * bu yüzden son değerden sıfıra "geri atlama" görülmez.
 *
 * Biçimlendirme `Intl.NumberFormat` ile: binlik ayracı ve para birimi dile
 * göre değişir, elle nokta/virgül konmaz.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * `cubic-bezier(0.16, 1, 0.3, 1)` yerine kullanılan yakınsama.
 * Gerçek Bézier çözümü Newton iterasyonu ister; sayan bir rakamda ikisi
 * gözle ayırt edilemiyor ve bu hâli her karede tek bir üs alma.
 */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export interface CounterProps {
  value: number;
  locale: string;
  /** `Intl.NumberFormat` seçenekleri — para, yüzde, ondalık basamak. */
  format?: Intl.NumberFormatOptions;
  /** Sayının önüne/arkasına eklenen sabit metin (₺, %, "+"). */
  prefix?: string;
  suffix?: string;
  durationSeconds?: number;
  className?: string;
}

export function Counter({
  value,
  locale,
  format,
  prefix,
  suffix,
  durationSeconds = 1.2,
  className,
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotionPreference();
  const [display, setDisplay] = useState(value);

  // Boyamadan önce sıfıra indir; sayım görünüre girince başlayacak.
  useIsomorphicLayoutEffect(() => {
    if (!reduced) setDisplay(0);
  }, [reduced]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (reduced) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    const run = () => {
      /*
       * Başlangıç anı `performance.now()` ile DEĞİL, ilk karenin kendi zaman
       * damgasıyla alınıyor. `requestAnimationFrame` geri çağrısına verilen
       * zaman, o karenin **başlangıcı**; bu değer, zamanlayıcıyı kurarken
       * okunan `performance.now()`tan küçük olabiliyor. Fark negatif ilerleme
       * üretiyor, `easeOutExpo` de onu negatif bir sayıya çeviriyordu —
       * ekranda bir an "−%11" yazıyordu.
       */
      let started: number | null = null;
      const tick = (now: number) => {
        started ??= now;
        const elapsed = (now - started) / (durationSeconds * 1000);
        const progress = Math.min(1, Math.max(0, elapsed));
        setDisplay(value * easeOutExpo(progress));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [reduced, value, durationSeconds]);

  // Ara kareler kesirli gelir; hedef tam sayıysa ondalık gösterilmez —
  // yoksa sayarken "1.234,567" gibi okunmaz bir değer titrer.
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
        ...format,
      }),
    [locale, value, format],
  );

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {formatter.format(display)}
      {suffix}
    </span>
  );
}
