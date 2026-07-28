/**
 * Daire sayısı kaydırıcısının kademeleri.
 *
 * NEDEN DOĞRUSAL DEĞİL: Paketler 5'ten 1000'e uzanıyor ama müşterilerin
 * çoğunluğu 5–50 aralığında. Doğrusal bir kaydırıcıda bu aralık yolun
 * yalnız %4,5'i olurdu — kullanıcı tam kendi binasını seçemezdi. Kademeler
 * küçük binalarda sık, büyükte seyrek.
 *
 * Kademeler paket sınırlarıyla (`STANDARD_PLANS`) örtüşmek zorunda değil;
 * plan seçimini her zaman `planForUnitCount` yapıyor. Buradaki liste yalnız
 * kaydırıcının çözünürlüğü.
 */
export const UNIT_STOPS = [
  5, 8, 12, 16, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 600, 750,
  1000,
] as const;

/** Kaydırıcının açılıştaki değeri — orta ölçekli bir apartman. */
export const DEFAULT_UNIT_COUNT = 40;

/** Serbest girilen bir daire sayısına en yakın kademenin dizini. */
export function nearestStopIndex(units: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, stop] of UNIT_STOPS.entries()) {
    const distance = Math.abs(stop - units);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}
