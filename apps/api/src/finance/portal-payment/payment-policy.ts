import type {
  PaymentFeePayer,
  PortalPaymentSummary,
} from "@yonetim/contracts";
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
 * değeri "açık" saymak, yöneticinin haberi olmadan her tahsilatta komisyon
 * yazmak olurdu. Kapalı varsayılan yanlışsa sonuç bir eksik özellik; açık
 * varsayılan yanlışsa sonuç sitenin ödemek zorunda kaldığı bir masraf.
 */
export interface PaymentSettings {
  onlineEnabled: boolean;
  feePaidBy: PaymentFeePayer;
}

export function readPaymentSettings(
  settings: Record<string, unknown> | null | undefined,
): PaymentSettings {
  const raw = settings?.payment;
  if (!raw || typeof raw !== "object") {
    return { onlineEnabled: false, feePaidBy: "management" };
  }

  const payment = raw as Record<string, unknown>;
  return {
    onlineEnabled: payment.onlineEnabled === true,
    // Tanınmayan değer "yönetim öder"e düşüyor: sakine beklemediği bir
    // komisyon yansıtmak, tahsilatın hiç açılmamasından daha kötü.
    feePaidBy: payment.feePaidBy === "resident" ? "resident" : "management",
  };
}

/**
 * Kartla ödeme **iki** koşula birden bağlı ve ikisi farklı sorumlulukta:
 *
 *  - `onlineEnabled`: yönetimin kararı. Her tahsilat komisyon doğuruyor;
 *    yöneticinin haberi olmadan açık gelmesi siteye masraf yazmak olurdu.
 *  - `providerConfigured`: platformun kurulumu. Ayar açık olsa da kimlik
 *    bilgileri yoksa sağlayıcıya istek atacak bir şey yok.
 *
 * Ayrım sakine de yansıyor: birincisinde "yönetiminiz kartla ödemeyi
 * açmamış" (ne yapacağını biliyor — yöneticiye söyler), ikincisinde "şu an
 * kullanılamıyor". Tek bir "ödeyemezsiniz" mesajı ikisini de çözümsüz
 * gösterirdi.
 *
 * Sağlayıcı durumu **parametre**: fonksiyonun içinden ortam değişkenine
 * bakılsaydı sıralamayı sınayan bir test yazılamazdı.
 */
export function onlineAvailability(
  settings: PaymentSettings,
  totalKurus: number,
  providerConfigured: boolean,
): PortalPaymentSummary["online"] {
  if (totalKurus <= 0) return { available: false, reason: "no_open_debt" };
  if (!settings.onlineEnabled) return { available: false, reason: "not_enabled" };
  if (!providerConfigured) return { available: false, reason: "provider_missing" };
  return { available: true, reason: null };
}

/**
 * TAHSİL EDİLEN ile BORCA MAHSUP EDİLEN aynı sayı değil — tek hesap yeri.
 *
 * `surchargeKurus` borcun **üstüne** eklenip çekilecek tutar: komisyonu sakin
 * karşılıyorsa iki komisyon da, yönetim karşılıyorsa hiçbiri. `settleKurus`
 * ise borca yazılacak olan ve komisyonu **hiçbir zaman** içermiyor.
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
    surchargeKurus:
      fees.paidBy === "resident"
        ? fees.platformFeeKurus + fees.processorFeeKurus
        : 0,
  };
}
