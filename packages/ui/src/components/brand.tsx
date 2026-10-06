import { siteConfig } from "@yonetim/config";

import { cn } from "../cn";

/**
 * Marka işareti ve kilitlenmiş logo (mark + kelime işareti).
 *
 * NEDEN BİLEŞEN, NEDEN DOSYA DEĞİL: kelime işareti bir görsele gömülseydi
 * başlık fontuyla ve tema renkleriyle birlikte değişmezdi; her tema/ölçek
 * kombinasyonu için ayrı dosya üretmek gerekirdi. İşaret satır içi SVG,
 * kelime işareti gerçek metin: ekran okuyucu markayı okur, arama motoru
 * metni görür, koyu temada renkler kendiliğinden döner.
 *
 * Statik dosya gereken yerler (schema.org `logo`, dış paylaşımlar) için
 * `apps/web/public/logo-light.svg` ve `logo-dark.svg` ayrıca duruyor —
 * ikisi de bu işaretin birebir aynısıdır.
 *
 * GEOMETRİ: ortak yaşamı temsil eden kemer ve eşik. Küçük ölçekte de
 * okunabilmesi için iki sade geometrik parça kullanılır.
 */

export interface BrandMarkProps {
  /** Piksel cinsinden kenar uzunluğu. */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden
      focusable="false"
      className={cn("text-primary", className)}
    >
      <path d="M3 22V11a9 9 0 0 1 18 0v11h-5V11a4 4 0 0 0-8 0v11Z" fill="currentColor" />
      <path d="M11 6h2v16h-2Z" fill="currentColor" />
    </svg>
  );
}

export interface BrandLockupProps {
  size?: number;
  /** Kelime işaretini gizler — dar başlıklarda ve mobil menüde. */
  markOnly?: boolean;
  className?: string;
}

/** İşaret + kelime işareti. Marka adı `siteConfig`ten gelir. */
export function BrandLockup({ size = 32, markOnly = false, className }: BrandLockupProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      {markOnly ? (
        <span className="sr-only">{siteConfig.brand.name}</span>
      ) : (
        <span className="brand-wordmark font-heading text-[17px] font-bold tracking-tight text-fg">
          {siteConfig.brand.name}
        </span>
      )}
    </span>
  );
}
