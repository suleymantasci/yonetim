/**
 * `@modal` yuvasının yükleme durumu: **hiçbir şey**.
 *
 * Çekmece rotası veri çekerken (`requirePermission`, seçenek listeleri)
 * askıya düşüyor. Yuvanın kendi yükleme dosyası yoksa bu askı üst segmentteki
 * `panel/loading.tsx` iskeletine kadar yükseliyordu: çekmece açılırken arkadaki
 * sayfa komple iskelete dönüyor, belge kısalıp kaydırma konumu kayboluyor ve
 * çekmece gelince sayfa yeniden çiziliyordu. Çekmece kendi yüklenirken boş
 * kalabilir; arka plan olduğu gibi durmalı.
 */
export default function ModalSlotLoading() {
  return null;
}
