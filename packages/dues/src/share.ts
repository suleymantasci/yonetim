import type { Kurus } from "@yonetim/core";

/**
 * Pay bölme ve arsa payı dönüşümleri — GAP 4.1.3 / 4.2.3.
 *
 * Bu iki işlem Server Action'ların içinde yazılmıştı; buraya taşındı çünkü
 * **saf fonksiyon** olarak test edilebilir olmaları gerekiyor: kuruş kaybı ve
 * arsa payı yuvarlaması sessizce yanlış çalışabilecek türden hesaplar.
 */

/**
 * Bir tutarı ağırlıklara göre böler. Kuruş kaybı **olmaz**: artan kuruşlar
 * en büyük kesirli parçaya sahip alıcılara birer birer dağıtılır
 * (largest remainder / Hare yöntemi).
 *
 * Ağırlık toplamı 0 ise herkese 0 verilir — tutarı rastgele birine yazmak
 * yerine hiç yazmamak doğru davranış; çağıran taraf bu durumu fark etmeli.
 */
export function splitAmount(total: Kurus, weights: number[]): Kurus[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * weight) / sum);
  const result = raw.map(Math.floor);
  let remainder = total - result.reduce((a, b) => a + b, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (const entry of order) {
    if (remainder <= 0) break;
    result[entry.index] = (result[entry.index] ?? 0) + 1;
    remainder -= 1;
  }
  return result;
}

export interface LandShareInput {
  /** Ondalık oran (0-1 veya 0-1000 ölçeği). */
  landShare?: number;
  /** Tapudaki pay (örn. 120). */
  numerator?: number;
  /** Tapudaki payda (örn. 1000). */
  denominator?: number;
}

export interface LandShareResult {
  /** Kanonik ondalık değer, altı basamak metin (veritabanı numeric alanı). */
  landShare: string | null;
  numerator: number | null;
  denominator: number | null;
}

/**
 * Arsa payını normalize eder.
 *
 * Kesir verildiyse **kesir kazanır** ve ondalık ondan türetilir: tapu kaydı
 * otoritedir, ondalık yalnız hesap kolaylığı. İkisi de yoksa null döner
 * (arsa payı bilinmiyor — formül bunu 0 ağırlık sayar).
 *
 * Payda 0 ise hata fırlatmaz, null döner: bozuk tek bir kayıt yüzünden toplu
 * içe aktarmanın tamamı düşmemeli, o satır "arsa payı yok" sayılır.
 */
export function resolveLandShare(input: LandShareInput): LandShareResult {
  const { numerator, denominator } = input;

  if (numerator !== undefined && denominator !== undefined) {
    if (denominator === 0) return { landShare: null, numerator: null, denominator: null };
    return {
      landShare: (numerator / denominator).toFixed(6),
      numerator,
      denominator,
    };
  }

  if (input.landShare !== undefined && Number.isFinite(input.landShare)) {
    return { landShare: input.landShare.toFixed(6), numerator: null, denominator: null };
  }

  return { landShare: null, numerator: null, denominator: null };
}

/**
 * Arsa payı toplamının tutarlı olup olmadığını söyler.
 *
 * Kabul edilen iki ölçek var: 1.0 (oran) ve 1000 (binde pay). Sapma toleransı
 * yuvarlama payı bırakır; bunun dışındaki toplam yönetim planında hata
 * olduğunu gösterir ve arayüzde uyarı verilir (körü körüne düzeltmeyiz —
 * hangi dairenin payı yanlış, veriyi girenin kararı).
 */
export function landShareTotalLooksWrong(total: number): boolean {
  if (total <= 0) return false;
  return Math.abs(total - 1) > 0.01 && Math.abs(total - 1000) > 1;
}
