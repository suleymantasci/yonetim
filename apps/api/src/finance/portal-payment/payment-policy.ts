import type { PortalPaymentSummary } from "@yonetim/contracts";
import type { FeeBreakdown } from "@yonetim/payment";

/**
 * Sitenin ödeme ayarları — `tenants.settings.payment` okumasının tek yeri.
 *
 * JSONB'den gelen bir sözlük hiçbir tip garantisi taşımıyor: eski siteler bu
 * anahtarı hiç içermiyor, elle düzenlenmiş bir kayıt saçma bir değer taşıyabilir.
 * Okumayı tek yerde toplamak, "acaba burada da varsayılan doğru mu" sorusunu
 * ortadan kaldırıyor.
 *
 * VARSAYILAN KAPALI. Ayar yoksa online tahsilat **açılmıyor**: bilinmeyen bir
 * değeri "açık" saymak, yöneticinin haberi olmadan sakinlerden komisyon
 * almaya başlamak olurdu.
 *
 * KOMİSYONU KİM ÖDER AYARI YOK (2026-07-29 kararı). Kural tek: aidat neyse
 * siteye o geçer, komisyon sakinden **ek olarak** alınır. Bunu seçenek yapmak
 * "yönetim karşılasın" durumunda sitenin aidatın bir kısmını komisyona
 * yedirmesi demekti — bütçe aidatın tamamı üzerinden kuruluyor.
 */
export interface PaymentSettings {
  onlineEnabled: boolean;
}

export function readPaymentSettings(
  settings: Record<string, unknown> | null | undefined,
): PaymentSettings {
  const raw = settings?.payment;
  if (!raw || typeof raw !== "object") return { onlineEnabled: false };

  const payment = raw as Record<string, unknown>;
  return { onlineEnabled: payment.onlineEnabled === true };
}

/**
 * Kartla ödeme **üç** koşula birden bağlı ve üçü farklı sorumlulukta:
 *
 *  - `onlineEnabled`: yönetimin kararı. Sakine borcunun üstünde bir tutar
 *    yansıyor; bunu açmak siteye ait bir karar.
 *  - `providerConfigured`: platformun kurulumu. Ayar açık olsa da kimlik
 *    bilgileri yoksa sağlayıcıya istek atacak bir şey yok.
 *  - `feeRatesKnown`: komisyon oranı yapılandırılmış mı. Bilinmiyorsa sakinden
 *    ne kadar ek ücret alınacağı da hesaplanamıyor; oranı tahmin edip tahsilat
 *    yapmak, siteye borcun tamamının geçeceği sözünü tutamamak demek.
 *
 * Ayrım sakine de yansıyor: birincisinde "yönetiminiz kartla ödemeyi açmamış"
 * (ne yapacağını biliyor — yöneticiye söyler), diğerlerinde "şu an
 * kullanılamıyor". Tek bir "ödeyemezsiniz" mesajı üçünü de çözümsüz gösterirdi.
 *
 * Sağlayıcı ve oran durumu **parametre**: fonksiyonun içinden ortam
 * değişkenine bakılsaydı sıralamayı sınayan bir test yazılamazdı.
 */
export function onlineAvailability(
  settings: PaymentSettings,
  totalKurus: number,
  providerConfigured: boolean,
  feeRatesKnown: boolean,
): PortalPaymentSummary["online"] {
  if (totalKurus <= 0) return { available: false, reason: "no_open_debt" };
  if (!settings.onlineEnabled) return { available: false, reason: "not_enabled" };
  if (!providerConfigured) return { available: false, reason: "provider_missing" };
  if (!feeRatesKnown) return { available: false, reason: "fee_not_configured" };
  return { available: true, reason: null };
}

/**
 * TAHSİL EDİLEN ile BORCA MAHSUP EDİLEN aynı sayı değil — tek hesap yeri.
 *
 * `surchargeKurus` borcun **üstüne** eklenip çekilecek tutar, `settleKurus`
 * ise borca yazılacak olan; ikincisi komisyonu **hiçbir zaman** içermiyor.
 *
 * İkisi karıştırılsaydı sakin, ödediği komisyon kadar borcunu da kapanmış
 * görürdü: site hem komisyonu öder hem borcun o kısmını tahsil edemezdi.
 * Bu yüzden ödeme başlatan uç ve webhook aynı ayrımı buradan okuyor.
 */
export function checkoutAmounts(fees: FeeBreakdown): {
  settleKurus: number;
  surchargeKurus: number;
} {
  return {
    settleKurus: fees.amountKurus,
    surchargeKurus: fees.totalKurus - fees.amountKurus,
  };
}
