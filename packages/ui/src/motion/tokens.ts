/**
 * Hareket token'larının JS karşılığı.
 *
 * CSS keyframe'leri `--motion-*` değişkenlerini okuyabiliyor; JS animasyonları
 * okuyamıyor (her kare için `getComputedStyle` çağırmak ölçülen şeyi bozar).
 * Bu yüzden aynı değerler burada bir kez daha yazılı — ve **ikisinin aynı
 * kaldığı `tests/design-tokens.test.ts` tarafından denetleniyor**. Birini
 * değiştirip diğerini unutmak testi kırar.
 *
 * Süreler saniye cinsinden: motion kütüphanesinin beklediği birim bu.
 */

export const MOTION_DURATION = {
  fast: 0.12,
  base: 0.22,
  slow: 0.42,
  slower: 0.72,
} as const;

export const MOTION_EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.28, 0.64, 1],
} as const;

export type MotionDuration = keyof typeof MOTION_DURATION;
