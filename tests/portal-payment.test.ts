import { describe, expect, it } from "vitest";

import {
  checkoutAmounts,
  onlineAvailability,
  readPaymentSettings,
} from "../apps/api/src/finance/portal-payment/payment-policy";
import { calculateFees, type FeeRates } from "../packages/payment/src/iyzico";

/**
 * Sakin ödemesinin iki kararı — PROJE-DURUMU §5.10.
 *
 * Testler fonksiyonların **kendisine** bakıyor çünkü ikisini de birden fazla
 * yer çağırıyor: uygunluk hem özet ucunda hem ödeme başlatan uçta (ekranın
 * düğmeyi gizlemesi kolaylık, kapı değil), tutar ayrımı hem checkout'ta hem
 * webhook'ta. İki tarafın ayrışması burada para kaybı demek.
 */
describe("ödeme ayarı okuma", () => {
  it("ayar hiç yoksa kartla tahsilat kapalı", () => {
    expect(readPaymentSettings(undefined)).toEqual({ onlineEnabled: false });
    expect(readPaymentSettings({})).toEqual({ onlineEnabled: false });
  });

  it("JSONB'den gelen tanınmayan değerler güvenli tarafa düşüyor", () => {
    // Elle düzenlenmiş ya da eski sürümden kalmış bir kayıt her şeyi taşıyabilir.
    expect(readPaymentSettings({ payment: "acik" })).toEqual({ onlineEnabled: false });
    expect(readPaymentSettings({ payment: { onlineEnabled: "true" } })).toEqual({
      onlineEnabled: false,
    });
  });

  it("eski kayıttaki feePaidBy alanı okunmuyor", () => {
    // Seçenek kaldırıldı; eski sitelerin sözlüğünde kalmış olabilir. Okunsaydı
    // "yönetim karşılasın" diyen bir kayıt bugünkü kuralı sessizce bozardı.
    expect(
      readPaymentSettings({ payment: { onlineEnabled: true, feePaidBy: "management" } }),
    ).toEqual({ onlineEnabled: true });
  });
});

describe("kartla ödeme uygunluğu", () => {
  const open = { onlineEnabled: true } as const;
  const closed = { onlineEnabled: false } as const;

  it("yönetim açmadıysa sebep not_enabled", () => {
    expect(onlineAvailability(closed, 10_000, true, true)).toEqual({
      available: false,
      reason: "not_enabled",
    });
  });

  it("ayar açık ama sağlayıcı kurulu değilse sebep provider_missing", () => {
    expect(onlineAvailability(open, 10_000, false, true)).toEqual({
      available: false,
      reason: "provider_missing",
    });
  });

  it("komisyon oranı tanımsızsa sebep fee_not_configured", () => {
    // Oran bilinmeden sakinden alınacak ek ücret hesaplanamıyor. Tahmini bir
    // oranla tahsilat, siteye borcun tamamının geçeceği sözünü tutmamak olurdu.
    expect(onlineAvailability(open, 10_000, true, false)).toEqual({
      available: false,
      reason: "fee_not_configured",
    });
  });

  it("borç yoksa diğer koşullara bakılmıyor", () => {
    // Sıra önemli: "ödenecek bir şey yok" derken "yönetiminiz kartla ödemeyi
    // açmamış" demek, sakini olmayan bir sorunla yöneticiye gönderirdi.
    expect(onlineAvailability(closed, 0, false, false)).toEqual({
      available: false,
      reason: "no_open_debt",
    });
  });

  it("koşulların hepsi sağlanınca açık", () => {
    expect(onlineAvailability(open, 10_000, true, true)).toEqual({
      available: true,
      reason: null,
    });
  });
});

/**
 * KURALIN KENDİSİ: aidat neyse siteye o geçer.
 *
 * Testler bir oran **varsaymıyor** — oranı parametre olarak veriyor ve her
 * seferinde sağlayıcının o oranla keseceği komisyonu simüle edip siteye kalanı
 * ölçüyor. Böylece sözleşme değişip oran güncellendiğinde de aynı güvence
 * geçerli: hangi oran olursa olsun site borcun tamamını alıyor.
 */
function rates(processorPct: number, fixed: number, platformPct = 0): FeeRates {
  return { processorPct, processorFixedKurus: fixed, platformPct };
}

/** Sağlayıcının çekilen tutardan keseceği komisyon. */
function providerCut(totalKurus: number, r: FeeRates): number {
  return (totalKurus * r.processorPct) / 100 + r.processorFixedKurus;
}

describe("komisyon borcun üstüne ekleniyor, aidat siteye net geçiyor", () => {
  const amount = 50_000; // 500,00 ₺

  it("siteye geçen tutar borcun tamamı — hiçbir oranda eksilmiyor", () => {
    for (const r of [
      rates(3.49, 35),
      rates(1.79, 0),
      rates(0, 250),
      rates(7.5, 199),
      rates(2, 25, 1), // platform hizmet bedeli de varken
    ]) {
      const fees = calculateFees({ amountKurus: amount, rates: r });
      const net = fees.totalKurus - providerCut(fees.totalKurus, r) - fees.platformFeeKurus;

      // Asıl güvence: siteye borcun tamamı geçiyor. Yukarı yuvarlama yüzünden
      // 1 kuruşa kadar fazla olabilir, **eksik olamaz**.
      expect(net).toBeGreaterThanOrEqual(amount);
      expect(net).toBeLessThan(amount + 1);
    }
  });

  it("naif hesap (borcun komisyonunu üstüne eklemek) yetmezdi", () => {
    // Komisyon çekilen tutar üzerinden alındığı için komisyonun kendisi de
    // komisyona tabi. Bu test o farkı görünür tutuyor: brütleştirme
    // kaldırılırsa aşağıdaki `naiveNet` kadar eksik tahsilat başlar.
    const r = rates(3, 35);
    const naiveTotal = amount + Math.round((amount * r.processorPct) / 100) + r.processorFixedKurus;
    const naiveNet = naiveTotal - providerCut(naiveTotal, r);
    expect(naiveNet).toBeLessThan(amount);

    const fees = calculateFees({ amountKurus: amount, rates: r });
    expect(fees.totalKurus).toBeGreaterThan(naiveTotal);
  });

  it("kalemler toplamı çekilecek tutarı kuruşu kuruşuna tutuyor", () => {
    const fees = calculateFees({ amountKurus: 123_457, rates: rates(3.49, 35, 1.5) });
    expect(fees.amountKurus + fees.platformFeeKurus + fees.processorFeeKurus).toBe(
      fees.totalKurus,
    );
  });

  it("borca yazılan tutar komisyondan etkilenmiyor", () => {
    const fees = calculateFees({ amountKurus: amount, rates: rates(3.49, 35) });
    const { settleKurus, surchargeKurus } = checkoutAmounts(fees);

    expect(settleKurus).toBe(amount);
    expect(surchargeKurus).toBe(fees.platformFeeKurus + fees.processorFeeKurus);
    expect(settleKurus + surchargeKurus).toBe(fees.totalKurus);
    expect(fees.totalKurus).toBeGreaterThan(amount);
  });

  it("çözümsüz oran hesaplanmıyor", () => {
    // %100 komisyonda hangi tutar çekilirse çekilsin siteye borç kalmıyor.
    // Sessizce bir sayı üretmek, tutmayacağı belli bir tahsilat başlatmaktı.
    expect(() => calculateFees({ amountKurus: amount, rates: rates(100, 0) })).toThrow();
  });
});
