import { describe, expect, it } from "vitest";

import {
  checkoutAmounts,
  onlineAvailability,
  readPaymentSettings,
} from "../apps/api/src/finance/portal-payment/payment-policy";
import { calculateFees } from "../packages/payment/src/iyzico";

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
    expect(readPaymentSettings(undefined)).toEqual({
      onlineEnabled: false,
      feePaidBy: "management",
    });
    expect(readPaymentSettings({})).toEqual({
      onlineEnabled: false,
      feePaidBy: "management",
    });
  });

  it("JSONB'den gelen tanınmayan değerler güvenli tarafa düşüyor", () => {
    // Elle düzenlenmiş ya da eski sürümden kalmış bir kayıt her şeyi taşıyabilir.
    expect(readPaymentSettings({ payment: "acik" })).toEqual({
      onlineEnabled: false,
      feePaidBy: "management",
    });
    expect(
      readPaymentSettings({ payment: { onlineEnabled: "true", feePaidBy: "kimse" } }),
    ).toEqual({ onlineEnabled: false, feePaidBy: "management" });
  });

  it("açıkça verilen değerler okunuyor", () => {
    expect(
      readPaymentSettings({ payment: { onlineEnabled: true, feePaidBy: "resident" } }),
    ).toEqual({ onlineEnabled: true, feePaidBy: "resident" });
  });
});

describe("kartla ödeme uygunluğu", () => {
  const open = { onlineEnabled: true, feePaidBy: "management" } as const;
  const closed = { onlineEnabled: false, feePaidBy: "management" } as const;

  it("yönetim açmadıysa sebep not_enabled", () => {
    expect(onlineAvailability(closed, 10_000, true)).toEqual({
      available: false,
      reason: "not_enabled",
    });
  });

  it("ayar açık ama sağlayıcı kurulu değilse sebep provider_missing", () => {
    expect(onlineAvailability(open, 10_000, false)).toEqual({
      available: false,
      reason: "provider_missing",
    });
  });

  it("borç yoksa diğer koşullara bakılmıyor", () => {
    // Sıra önemli: "ödenecek bir şey yok" derken "yönetiminiz kartla ödemeyi
    // açmamış" demek, sakini olmayan bir sorunla yöneticiye gönderirdi.
    expect(onlineAvailability(closed, 0, false)).toEqual({
      available: false,
      reason: "no_open_debt",
    });
  });

  it("her iki koşul da sağlanınca açık", () => {
    expect(onlineAvailability(open, 10_000, true)).toEqual({
      available: true,
      reason: null,
    });
  });
});

describe("tahsil edilen ve borca mahsup edilen tutar", () => {
  const amount = 100_000; // 1.000,00 ₺

  it("yönetim karşılıyorsa sakinden yalnız borç çekiliyor", () => {
    const fees = calculateFees({ amountKurus: amount, paidBy: "management" });
    expect(checkoutAmounts(fees)).toEqual({
      settleKurus: amount,
      surchargeKurus: 0,
    });
    expect(fees.totalKurus).toBe(amount);
  });

  it("sakin karşılıyorsa komisyon borcun üstüne ekleniyor ama borca yazılmıyor", () => {
    const fees = calculateFees({ amountKurus: amount, paidBy: "resident" });
    const { settleKurus, surchargeKurus } = checkoutAmounts(fees);

    // Borca yazılan tutar komisyondan etkilenmiyor — asıl güvence bu.
    expect(settleKurus).toBe(amount);
    expect(surchargeKurus).toBe(fees.platformFeeKurus + fees.processorFeeKurus);
    // Çekilen tutar = borç + komisyon.
    expect(settleKurus + surchargeKurus).toBe(fees.totalKurus);
    expect(fees.totalKurus).toBeGreaterThan(amount);
  });

  it("komisyon oranı değişse de borca yazılan tutar sabit", () => {
    const fees = calculateFees({
      amountKurus: amount,
      paidBy: "resident",
      platformFeePct: 2,
      processorPct: 5,
      processorFixedKurus: 100,
    });
    expect(checkoutAmounts(fees).settleKurus).toBe(amount);
    expect(checkoutAmounts(fees).surchargeKurus).toBe(2_000 + 5_000 + 100);
  });
});
