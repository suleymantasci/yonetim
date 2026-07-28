"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";

/**
 * Hareket bağlamı — her iki uygulamanın kök layout'una girer.
 *
 * NEDEN VAR: Bu depo hareketi iki ayrı kanaldan kapatıyor — işletim sistemi
 * tercihi (`prefers-reduced-motion`) ve kullanıcının panelden seçtiği tercih
 * (`yonetim_a11y` çerezi → `<html data-motion="reduced">`). İkisi de CSS
 * kuralı; `tokens.css` süreleri 0.01ms'ye indiriyor.
 *
 * JS ile yürüyen hareket (sayaç, imleç takibi) bu kuralı GÖRMEZ: değeri her
 * karede JavaScript yazdığı için CSS geçiş süresinin hükmü yok. Bu bağlam o
 * köprüdür: `reducedMotion` sunucuda çerezden okunur, sistem tercihi
 * istemcide dinlenir, ikisi OR'lanır.
 *
 * NEDEN HAREKET KÜTÜPHANESİ YOK: Bu katman önce `motion` (framer-motion)
 * üzerine kuruldu ve ölçüldü — hidrasyondan sonra **62.8 kB gzip** ek yük
 * getiriyordu. Karşılığında aldığımız şey, görünüre girince beliren bloklar
 * ve sayan rakamlardı; ikisi de IntersectionObserver + CSS geçişi ve tek bir
 * `requestAnimationFrame` döngüsüyle ~1 kB'de çözülüyor.
 * `overlay.tsx`'teki kural burada da geçerli: bundle politikası harici
 * kütüphaneye değil, **karşılıksız** harici kütüphaneye kapalı.
 *
 * Layout animasyonu, sürükleme, paylaşılan öğe geçişi gibi gerçekten pahalı
 * işler gerekirse karar tersine çevrilebilir: bu modülün dış API'si
 * (`Reveal`, `Stagger`, `Counter`, `Spotlight`) kütüphaneden bağımsız.
 */

const ForcedReducedMotion = createContext(false);

export interface MotionProviderProps {
  /** Sunucuda `yonetim_a11y` çerezinden okunan kullanıcı tercihi. */
  reducedMotion?: boolean;
  children: ReactNode;
}

export function MotionProvider({ reducedMotion = false, children }: MotionProviderProps) {
  return (
    <ForcedReducedMotion.Provider value={reducedMotion}>{children}</ForcedReducedMotion.Provider>
  );
}

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Etkin hareket tercihi.
 *
 * Sistem tercihi `useSyncExternalStore` ile okunur: sunucuda `false` döner
 * (çerez tercihi zaten sunucuda biliniyor), istemcide medya sorgusuna abone
 * olur — kullanıcı işletim sistemi ayarını sayfa açıkken değiştirirse anında
 * uygulanır.
 */
export function useReducedMotionPreference(): boolean {
  const forced = useContext(ForcedReducedMotion);

  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const system = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );

  return forced || system;
}
