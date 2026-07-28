"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Drawer } from "@yonetim/ui";

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
export function RouteDrawer({
  title,
  description,
  children,
  closeLabel,
  size = "lg",
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Drawer
      open={open}
      onClose={() => {
        // Önce kapanış animasyonu, sonra gezinme: `back()`'i doğrudan çağırmak
        // paneli tek karede yok ediyor ve kapanış hareketi hiç görünmüyor.
        setOpen(false);
        router.back();
      }}
      title={title}
      description={description}
      size={size}
      closeLabel={closeLabel}
    >
      {children}
    </Drawer>
  );
}
