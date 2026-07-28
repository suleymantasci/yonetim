"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { useReducedMotionPreference } from "@yonetim/ui/motion";

/**
 * Hareket motoru — YALNIZ pazarlama sitesinde.
 *
 * KATMANLAMA: Hareket **tercihi** `packages/ui/src/motion` içinde yaşıyor
 * (`MotionProvider` + `useReducedMotionPreference`) çünkü panel de aynı
 * tercihi okuyor. Hareket **motoru** burada, `apps/web` altında: panelde
 * animasyon kütüphanesi yok, dolayısıyla panelin bundle'ı ödemiyor.
 *
 * NEDEN KÜTÜPHANE: Pazarlama sayfasında hareket bir cila değil, anlatının
 * kendisi — kaydırmaya bağlı ürün gösterimi, giren/çıkan içerik, yay tabanlı
 * mikro etkileşimler. Bunları elle yazmak `requestAnimationFrame` üstünde
 * ikinci bir animasyon motoru yazmak demek.
 *
 * ERİŞİLEBİLİRLİK KÖPRÜSÜ: `MotionConfig reducedMotion`, çerezden gelen
 * kullanıcı tercihi ile işletim sistemi tercihini birleştiren
 * `useReducedMotionPreference()`e bağlı. CSS kill-switch'i JS animasyonlarını
 * görmediği için bu köprü olmadan hareket azaltma sessizce delinirdi.
 *
 * `LazyMotion strict`: `motion.div` yasak, `m.div` zorunlu — `motion.*` tüm
 * özellik paketini ilk parçaya çeker.
 */

const loadFeatures = () => import("./features").then((module) => module.default);

export function MotionEngine({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionPreference();

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion={reduced ? "always" : "user"}>{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * Pazarlama bileşenlerinin kullanacağı yüzey. Doğrudan `motion/react`ten
 * almak yerine buradan alın: `m` dışında bir şey sızarsa `strict` kipi
 * çalışma anında patlar, burada tek yerden görülür.
 *
 * LİSTE BİLEREK KISA. Bu modül kök layout'tan (`MotionEngine`) çekildiği için
 * paylaşılan parçada duruyor; buraya eklenen ve bir yerde kullanılan her
 * yardımcı, **tüm route'ların** ilk yükünü büyütüyor. `useScroll` + `useSpring`
 * çifti tek bir okuma çubuğu için 209 → 214,7 kB fark yaratmıştı; çubuk CSS'e
 * taşındı, ikisi de buradan çıkarıldı. Yeni bir yardımcı eklemeden önce
 * `node scripts/bundle-budget.mjs` ile ölçün.
 */
export { AnimatePresence, m } from "motion/react";
