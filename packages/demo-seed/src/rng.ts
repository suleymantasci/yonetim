/**
 * Tohumlu rastgele sayı üreteci (mulberry32).
 *
 * Demo verisi herkeste AYNI olmalı: iki kişi aynı demoyu açtığında aynı
 * sakinleri, aynı borçluları, aynı arıza kayıtlarını görmeli — destek ekibi
 * "A blok 7 numaradaki borçluya bakın" diyebilsin. `Math.random()` her
 * çalıştırmada farklı veri üretirdi; burada tohum sabit, yalnız tarihler
 * "şimdi"ye göre kayıyor.
 */
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max] tam sayı */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (probability) => next() < probability,
  };
}
