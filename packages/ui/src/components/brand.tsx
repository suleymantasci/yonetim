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
 * GEOMETRİ: üç yükselen kütle. Hem bina siluetini hem büyüme grafiğini
 * okutuyor; 16px'te de ayrışsın diye çubuklar kalın ve az sayıda tutuldu.
 */

const BAR_BASELINE = 18.5;

/** [x, yükseklik] — en yüksek kütle vurgu rengiyle boyanır. */
const BARS: ReadonlyArray<readonly [number, number]> = [
  [5, 5.5],
  [10.25, 10.5],
  [15.5, 7.5],
];

const TALLEST = 1;

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
      className={cn("text-ink", className)}
    >
      <rect width={24} height={24} rx={6} fill="currentColor" />
      {BARS.map(([x, height], index) => (
        <rect
          key={x}
          x={x}
          y={BAR_BASELINE - height}
          width={3.5}
          height={height}
          rx={1.25}
          className={index === TALLEST ? "fill-accent" : "fill-ink-fg"}
        />
      ))}
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
        <span className="font-heading text-[17px] font-bold tracking-tight text-fg">
          {siteConfig.brand.name}
        </span>
      )}
    </span>
  );
}
