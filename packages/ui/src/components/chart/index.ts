/**
 * Grafik katmanı — F0.3.
 *
 * Üç halka, dışarıdan tek yüzey:
 *   `palette.ts`     renk sözleşmesi (motorsuz, sunucuda da okunur)
 *   `frame.tsx`      çerçeve + **tablo görünümü** (Recharts'a bağımlı DEĞİL)
 *   `primitives.tsx` sparkline / bullet (tek `<svg>`, motorsuz)
 *   `marks.tsx`      Recharts işaretleri — yalnız `lazy.tsx` üzerinden yüklenir
 *   `lazy.tsx`       hidrasyon kapısı + sabit yükseklikli iskelet
 *
 * `marks.tsx` bilerek buradan dışa aktarılmıyor: doğrudan ithal edilirse
 * motor paylaşılan parçaya girer ve `ssr:false` garantisi kaybolur.
 */
export * from "./palette";
export * from "./frame";
export * from "./primitives";
export * from "./lazy";
