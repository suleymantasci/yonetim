import NextLink from "next/link";
import type { ComponentProps } from "react";

import { isDrawerHref } from "@/lib/drawer-routes";

/**
 * Panelin bağlantısı: `next/link` + çekmece rotalarında otomatik kaydırma kapalı.
 *
 * Çekmece sayfanın **üstünde** bir katman; arkadaki sayfanın kaydırma konumu
 * değişmemeli. Next ise her gezinmede değişen segmenti görünür alana
 * kaydırıyor (çekmece rotasında bu sayfayı başa/ortaya atıyordu). `scroll={false}`
 * bunu kaynağında kesiyor. Çekmece olmayan adreslerde varsayılan davranış
 * (yeni sayfa başa gider) korunuyor.
 */
export default function Link({ scroll, prefetch, href, ...rest }: ComponentProps<typeof NextLink>) {
  const drawer = isDrawerHref(typeof href === "string" ? href : href?.pathname);
  return (
    <NextLink
      href={href}
      scroll={scroll ?? !drawer}
      // Çekmece rotası için ön yükleme kapalı: Next, kesilen (intercepting)
      // adresin ön yüklemesini hedef sayfanın kendi ağacıyla önbelleğe
      // alıyor; tıklamada önbellek ile kesilen yanıt uyuşmayınca ya tam sayfa
      // yenilemeye düşüyor ya da arkadaki sayfa yükleme iskeletine dönüyordu.
      prefetch={prefetch ?? (drawer ? false : undefined)}
      {...rest}
    />
  );
}
