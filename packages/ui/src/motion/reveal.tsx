"use client";

import {
  Children,
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "../cn";
import { useReducedMotionPreference } from "./motion-provider";

/**
 * Görünüre girince açılan bloklar.
 *
 * JS KAPALIYKEN İÇERİK KAYBOLMAZ — bu, kaydırma animasyonlarının en sık
 * yapılan hatası. Sunucu çıktısında hiçbir gizleme sınıfı yok; öğe tam
 * görünür render edilir. Gizleme yalnız istemcide, boyamadan önce
 * (`useLayoutEffect`) ve yalnız öğe henüz ekranın altındaysa uygulanır.
 * Ekranda zaten görünen bir blok hiç gizlenmez, dolayısıyla ilk ekranda
 * yanıp sönme (FOUC) olmaz ve LCP öğesi animasyona takılmaz.
 *
 * TASARIM KURALI: hareket **yalnız giriş** içindir. Blok bir kez açılır ve bir
 * daha oynamaz; yukarı kaydırınca yeniden animasyon başlaması okunan yeri
 * kaybettiriyor. Yer değiştirme 18px ile sınırlı.
 *
 * Geçişin kendisi CSS'te (`tokens.css` → `[data-reveal]`): süre ve eğri
 * hareket token'larından gelir, hareket azaltma kuralı da orada devreye girer.
 */

/** Sarmalayıcı etiket kümesi bilinçli olarak dar: düzen anlamı taşıyanlar. */
export type RevealTag = "div" | "section" | "article" | "header" | "li" | "p" | "span" | "ul";

type Direction = "up" | "down" | "left" | "right" | "none";

const OFFSET: Record<Direction, { x: string; y: string }> = {
  up: { x: "0", y: "18px" },
  down: { x: "0", y: "-18px" },
  left: { x: "18px", y: "0" },
  right: { x: "-18px", y: "0" },
  none: { x: "0", y: "0" },
};

/** Sunucuda `useLayoutEffect` uyarı basar; davranış aynı kaldığı için takas. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Öğe ekranın altındaysa gizler, görünüre girince açar.
 * Dönen `state`: `"idle"` (sunucu / hareket kapalı — hiç müdahale yok),
 * `"hidden"`, `"shown"`.
 */
function useRevealState(reduced: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduced) return;

    // Zaten görünen (ya da neredeyse görünen) blok gizlenmez.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) {
      setState("shown");
      return;
    }

    setState("hidden");

    /*
     * KÖK PAYI, EŞİK DEĞİL. Önce `threshold: 0.15` kullanılıyordu ve bu,
     * atlamalı kaydırmada içeriği kalıcı olarak görünmez bırakıyordu:
     * bir çapa bağlantısına tıklandığında (özellik dizini, içindekiler),
     * tarayıcı kaydırma konumunu geri yüklediğinde ya da geri tuşuyla
     * dönüldüğünde aradaki bloklar hiç kesişmeden ekranın üstünde kalıyor,
     * gözlemci de "kesişme oranı 0 → 0" gördüğü için hiç ateşlenmiyordu.
     * Ölçüldü: `/ozellikler` sayfasında y=2000'e atlayınca 4–7. kartlar boş
     * kaldı.
     *
     * Kökün üst kenarını çok yukarı taşımak bunu kökten çözüyor: ekranın
     * üstünde kalan her öğe artık kökün *içinde* sayılıyor, dolayısıyla
     * atlanan bloklar da açılıyor. Alt kenardaki -%12, eski eşiğin yerine
     * geçiyor — blok, açılmadan önce ekranın altından bir miktar yukarı
     * girmiş olmalı.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        // `top < 0` ikinci bir emniyet: kök payını kırpan bir tarayıcıda da
        // ekranın üstünde kalmış blok açılır.
        if (entries.some((entry) => entry.isIntersecting || entry.boundingClientRect.top < 0)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "100000px 0px -12% 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reduced]);

  return { ref, state };
}

export interface RevealProps {
  children: ReactNode;
  as?: RevealTag;
  direction?: Direction;
  /** Saniye cinsinden gecikme — sıralı açılışta. */
  delay?: number;
  className?: string;
}

export function Reveal({
  children,
  as = "div",
  direction = "up",
  delay = 0,
  className,
}: RevealProps) {
  const reduced = useReducedMotionPreference();
  const { ref, state } = useRevealState(reduced);
  const offset = OFFSET[direction];

  return createElement(
    as,
    {
      ref,
      className: cn(className),
      "data-reveal": state === "idle" ? undefined : state,
      style: {
        "--reveal-x": offset.x,
        "--reveal-y": offset.y,
        ...(delay ? { "--reveal-delay": `${delay}s` } : {}),
      } as CSSProperties,
    },
    children,
  );
}

export interface StaggerProps {
  children: ReactNode;
  as?: RevealTag;
  /** Çocuklar arası gecikme (saniye). */
  step?: number;
  direction?: Direction;
  /** Her çocuğu saran öğenin etiketi — `ul` içinde `li` olmalı. */
  itemAs?: RevealTag;
  className?: string;
}

/**
 * Çocuklarını sırayla açar. Gecikmeyi listedeki konumdan hesaplar; eleman
 * sayısı değişince elle güncelleme gerekmez.
 *
 * Gecikme 6 elemandan sonra artmaz: 12 kartlık bir ızgarada son kart 0.72s
 * sonra açılsaydı, kullanıcı çoktan kaydırmış olurdu.
 */
export function Stagger({
  children,
  as = "div",
  itemAs = "div",
  step = 0.06,
  direction = "up",
  className,
}: StaggerProps) {
  const items = Children.toArray(children);

  return createElement(
    as,
    { className: cn(className) },
    items.map((child, index) => (
      <Reveal key={index} as={itemAs} direction={direction} delay={Math.min(index, 5) * step}>
        {child}
      </Reveal>
    )),
  );
}
