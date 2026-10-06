"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { Drawer } from "@yonetim/ui";

import { getLastPageScrollY } from "./scroll-memory";

/**
 * Rota kesen çekmece (intercepting route kabuğu) — UI Faz 2.4.
 *
 * SORUN: "bağımsız bölüm ekle" listeden ayrı bir sayfaya götürüyordu. Kullanıcı
 * arka arkaya kayıt girerken her seferinde listeyi kaybediyor, filtre/sayfa
 * durumu sıfırlanıyor ve "birimi ekledim, şimdi sakinini de ekleyeyim" akışı
 * üç ayrı gezinme oluyordu.
 *
 * ÇÖZÜM VE NEDEN BU ÇÖZÜM: Next'in **intercepting + parallel route** ikilisi.
 * `@modal/(.)birimler/yeni` yalnızca **istemci gezinmesinde** devreye giriyor;
 * adres yine `/panel/birimler/yeni` oluyor. Sonuçları tek tek önemli:
 *
 *  · Adres paylaşılabilir kalıyor — bağlantıyı açan kişi tam sayfa formu görür
 *    (aynı `page.tsx`, ikinci bir kopya yok).
 *  · Geri tuşu çekmeceyi kapatıyor, çünkü çekmece gerçekten bir rota.
 *  · Liste **unmount olmuyor**: filtre, sayfa, seçim, kaydırma konumu duruyor.
 *    İstemci state'inde saklanan bir modal da bunu yapardı ama o zaman adres
 *    ve geri tuşu kaybolurdu.
 *
 * Kapanış `router.back()` ile: çekmece geçmişe bir kayıt eklediği için doğru
 * karşılığı geçmişten bir adım geri gitmek. `replace` ile listeye dönmek,
 * kullanıcının çekmece öncesi geçmişini de silerdi.
 */
const RouteDrawerCloseContext = createContext<(() => void) | null>(null);

/**
 * Kaydırma konumunu koruma.
 *
 * SORUN: Next, her gezinmede değişen segmentin ilk DOM düğümünü görünür
 * alana kaydırıyor (`InnerScrollAndFocusHandler`). Çekmece rotasında bu
 * düğüm sayfanın dışında kaldığı için kullanıcı sayfayı kaydırmış olsa da
 * açılışta konum sıfırlanıyor/atlıyordu; kapanışta da (geri gezinme) aynı
 * şey oluyordu. Çekmece sayfanın **üstünde** duran bir katman: arkadaki
 * sayfanın konumu hiç değişmemeli.
 *
 * ÇÖZÜM: konumu, Next'in kaydırmasından **önce** yakalayıp sonra geri
 * yazmak. Next kaydırmayı commit'in yerleşim aşamasında yapıyor; bu yüzden
 * geri yazma ilk karelerde birkaç kez deneniyor. Kullanıcı bu sırada
 * kendisi kaydırırsa (tekerlek, dokunma, klavye) vazgeçiliyor — kullanıcının
 * hareketiyle savaşılmıyor.
 */
const GUARD_MS = 900;

function restoreScrollSoon(target: number) {
  if (typeof window === "undefined") return;
  const start = performance.now();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  const events = ["wheel", "touchstart", "keydown", "mousedown"] as const;
  for (const name of events) window.addEventListener(name, cancel, { once: true, passive: true });

  const tick = () => {
    if (cancelled || performance.now() - start > GUARD_MS) {
      for (const name of events) window.removeEventListener(name, cancel);
      return;
    }
    if (Math.abs(window.scrollY - target) > 1) {
      window.scrollTo({ top: target, left: 0, behavior: "instant" });
    }
    // `setTimeout`, `requestAnimationFrame` değil: arka plan sekmesinde rAF
    // duruyor, geri yazma da o zaman hiç çalışmıyordu.
    setTimeout(tick, 16);
  };
  setTimeout(tick, 0);
}

/**
 * Çekmeceyi içeriden kapatmak için.
 *
 * Çekmece kabuğu sunucu bileşeninden besleniyor; içindeki "Vazgeç" düğmesinin
 * kapatma işini kendi başına `router.back()` ile yapması mümkün ama o zaman
 * kapanış animasyonu atlanır (kabuk `open=false` yapmadan yok olur). Kapatma
 * kararı tek yerde kalsın diye bağlamdan geçiriliyor. Çekmece dışında
 * çağrılırsa hiçbir şey yapmaz — form aynı bileşenle tam sayfada da render
 * edilebiliyor.
 */
export function useRouteDrawerClose(): () => void {
  const close = useContext(RouteDrawerCloseContext);
  return useCallback(() => close?.(), [close]);
}

export function RouteDrawer({
  title,
  description,
  children,
  closeLabel,
  size = "lg",
  /**
   * `false`: gövdenin iç boşluğunu ve kaydırmasını çocuk yönetir. Form
   * kabuğu (`ActionForm layout="modal"`) kendi kaydırma alanını ve alt barını
   * kurduğu için gerekli — iki kaydırma alanı iç içe geçtiğinde alt barın
   * altında ikinci bir çubuk ve yatay taşma oluşuyordu.
   */
  padded = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel: string;
  size?: "sm" | "md" | "lg" | "xl";
  padded?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  // Açılışta Next'in kaydırmasını geri al: konum, hiçbir diyalog açık değilken
  // izlenen son değer (aşağıdaki izleyici).
  useEffect(() => {
    restoreScrollSoon(getLastPageScrollY());
  }, []);

  const close = useCallback(() => {
    // Önce kapanış animasyonu, sonra gezinme: `back()`'i doğrudan çağırmak
    // paneli tek karede yok ediyor ve kapanış hareketi hiç görünmüyor.
    setOpen(false);
    router.back();
    restoreScrollSoon(getLastPageScrollY());
  }, [router]);

  return (
    <RouteDrawerCloseContext.Provider value={close}>
      <Drawer
        open={open}
        onClose={close}
        title={title}
        description={description}
        size={size}
        closeLabel={closeLabel}
        padded={padded}
      >
        {children}
      </Drawer>
    </RouteDrawerCloseContext.Provider>
  );
}
