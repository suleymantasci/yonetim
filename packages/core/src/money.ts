/**
 * Para birimi: TÜM tutarlar tam sayı **kuruş** olarak taşınır.
 * Float aritmetiği finansal hesaplarda kullanılmaz (SPEC Bölüm 9.3: aidat hesabı deterministik).
 */
export type Kurus = number;

export const KURUS_IN_TL = 100;

export function tlToKurus(tl: number): Kurus {
  return Math.round(tl * KURUS_IN_TL);
}

export function kurusToTl(kurus: Kurus): number {
  return kurus / KURUS_IN_TL;
}

/** Yüzde uygulaması — banker's rounding değil, yarım yukarı (mali teamül). */
export function applyPct(amount: Kurus, pct: number): Kurus {
  return roundHalfUp((amount * pct) / 100);
}

export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Bir tutarı ağırlıklara göre böler ve **kuruş kaybı olmadan** dağıtır.
 * Kalan kuruşlar en büyük ağırlıktan başlayarak 1'er dağıtılır (largest remainder method).
 */
export function distribute(total: Kurus, weights: number[]): Kurus[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Ağırlık yoksa eşit böl.
    return distribute(total, weights.map(() => 1));
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  let idx = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[idx % order.length]!;
    result[target.i] = (result[target.i] ?? 0) + 1;
    remainder--;
    idx++;
  }
  return result;
}

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
});

export function formatKurus(kurus: Kurus): string {
  return tryFormatter.format(kurusToTl(kurus));
}

export function formatTl(tl: number): string {
  return tryFormatter.format(tl);
}
