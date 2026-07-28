/**
 * Okuma ilerlemesi — sayfanın en üstünde ince bir çizgi.
 *
 * NEDEN VAR: Uzun rehber yazılarında "ne kadar kaldı" sorusunun tek cevabı
 * kaydırma çubuğuydu; mobilde o da görünmüyor. Çizgi, okumaya devam etme
 * kararını ucuzlatıyor.
 *
 * SUNUCU BİLEŞENİ: Animasyonun tamamı CSS'te (`tokens.css` → `.reading-progress`,
 * `animation-timeline: scroll()`). Bu bileşen yalnız bir `div` yazıyor —
 * istemciye tek satır JavaScript gitmiyor. `motion` kütüphanesinin
 * `useScroll` + `useSpring` çifti aynı işi yapıyordu ama paylaşılan parçaya
 * ~6 kB ekliyordu; gerekçe `tokens.css` içinde.
 *
 * BİLGİ TAŞIMAZ: Tamamen dekoratif olduğu için `aria-hidden`. Ekran okuyucuya
 * her kaydırmada değişen bir yüzde okutmak gürültüden ibaret olurdu; aynı
 * bilgi yazının başında "N dakika okuma" olarak metin hâlinde duruyor.
 */
export function ReadingProgress() {
  return <div aria-hidden className="reading-progress fixed inset-x-0 top-0 z-50 h-0.5 bg-primary" />;
}
