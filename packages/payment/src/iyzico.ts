import { createHmac, randomUUID } from "node:crypto";

import { serverEnv, siteConfig } from "@yonetim/config";
import {
  Err, Ok, errors, kurusToTl, roundHalfUp, withRetry, type Kurus, type Result,
} from "@yonetim/core";

/**
 * iyzico Checkout Form (hosted) — SPEC Bölüm 7.1.
 * PCI-DSS yükü iyzico'da kalır; 3D Secure zorunludur (BKM yönergesi).
 */

export interface CheckoutRequest {
  conversationId: string;
  /** Borç tutarı — sepet toplamı, iyzico'nun `price` alanı. */
  amountKurus: Kurus;
  /**
   * Borcun **üstüne** eklenip çekilecek ek ücret (platform bedeli + sağlayıcı
   * komisyonu). `paidPrice = amountKurus + surchargeKurus` olur; sepet
   * kalemleri değişmez, çünkü satılan şey hâlâ o borç.
   */
  surchargeKurus?: Kurus;
  buyer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    phone: string;
    identityNumber?: string;
    address: string;
    city: string;
    ip: string;
  };
  basketItems: { id: string; name: string; category: string; priceKurus: Kurus }[];
  callbackUrl: string;
  /** Taksit seçenekleri (1 = tek çekim). */
  enabledInstallments?: number[];
}

export interface CheckoutSession {
  token: string;
  checkoutFormContent: string;
  paymentPageUrl: string;
  conversationId: string;
}

export interface PaymentDetail {
  status: "success" | "failure";
  paymentId: string;
  conversationId: string;
  paidPriceKurus: Kurus;
  installment: number;
  cardLast4?: string;
  cardBrand?: string;
  /** iyzico komisyonu (şeffaf gösterim). */
  merchantCommissionKurus: Kurus;
  errorMessage?: string;
  raw: Record<string, unknown>;
}

function creds() {
  const c = serverEnv.iyzico();
  if (!c.apiKey || !c.secretKey) return null;
  return c;
}

export function isIyzicoConfigured(): boolean {
  return creds() !== null;
}

/** iyzico v2 HmacSHA256 yetkilendirme başlığı. */
function authHeader(uriPath: string, body: string, apiKey: string, secretKey: string) {
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const payload = randomKey + uriPath + body;
  const signature = createHmac("sha256", secretKey).update(payload).digest("hex");
  const authorization = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return {
    Authorization: `IYZWSv2 ${Buffer.from(authorization).toString("base64")}`,
    "x-iyzi-rnd": randomKey,
    "Content-Type": "application/json",
  };
}

async function post<T>(uriPath: string, body: unknown): Promise<Result<T>> {
  const c = creds();
  if (!c) return Err(errors.integrationUnavailable("iyzico"));
  const raw = JSON.stringify(body);
  try {
    const json = await withRetry(
      async () => {
        const r = await fetch(`${c.baseUrl}${uriPath}`, {
          method: "POST",
          headers: authHeader(uriPath, raw, c.apiKey!, c.secretKey!),
          body: raw,
        });
        if (!r.ok) throw new Error(`iyzico HTTP ${r.status}`);
        return (await r.json()) as T;
      },
      { attempts: 3 },
    );
    return Ok(json);
  } catch (error) {
    return Err(errors.integrationUnavailable(`iyzico (${(error as Error).message})`));
  }
}

const tl = (k: Kurus) => kurusToTl(k).toFixed(2);

export async function createCheckout(req: CheckoutRequest): Promise<Result<CheckoutSession>> {
  const total = req.amountKurus + (req.surchargeKurus ?? 0);
  const body = {
    locale: "tr",
    conversationId: req.conversationId,
    price: tl(req.amountKurus),
    paidPrice: tl(total),
    currency: siteConfig.legal.currency,
    basketId: req.conversationId,
    paymentGroup: "SUBSCRIPTION",
    callbackUrl: req.callbackUrl,
    enabledInstallments: req.enabledInstallments ?? [1, 2, 3, 6, 9],
    // 3D Secure zorunlu (Bölüm 7.1).
    forceThreeDS: 1,
    buyer: {
      id: req.buyer.id,
      name: req.buyer.name,
      surname: req.buyer.surname,
      gsmNumber: req.buyer.phone,
      email: req.buyer.email,
      identityNumber: req.buyer.identityNumber ?? "11111111111",
      registrationAddress: req.buyer.address,
      ip: req.buyer.ip,
      city: req.buyer.city,
      country: "Turkey",
    },
    shippingAddress: {
      contactName: `${req.buyer.name} ${req.buyer.surname}`,
      city: req.buyer.city,
      country: "Turkey",
      address: req.buyer.address,
    },
    billingAddress: {
      contactName: `${req.buyer.name} ${req.buyer.surname}`,
      city: req.buyer.city,
      country: "Turkey",
      address: req.buyer.address,
    },
    basketItems: req.basketItems.map((i) => ({
      id: i.id,
      name: i.name,
      category1: i.category,
      itemType: "VIRTUAL",
      price: tl(i.priceKurus),
    })),
  };

  const res = await post<Record<string, string>>("/payment/iyzipos/checkoutform/initialize/auth/ecom", body);
  if (!res.ok) return res;
  if (res.value.status !== "success") {
    return Err(errors.paymentFailed(res.value.errorMessage ?? "Ödeme başlatılamadı."));
  }
  return Ok({
    token: res.value.token ?? "",
    checkoutFormContent: res.value.checkoutFormContent ?? "",
    paymentPageUrl: res.value.paymentPageUrl ?? "",
    conversationId: req.conversationId,
  });
}

export async function retrievePayment(token: string): Promise<Result<PaymentDetail>> {
  const res = await post<Record<string, unknown>>("/payment/iyzipos/checkoutform/auth/ecom/detail", {
    locale: "tr",
    token,
  });
  if (!res.ok) return res;

  const v = res.value;
  const status = String(v.paymentStatus ?? v.status ?? "");
  return Ok({
    status: status === "SUCCESS" || v.status === "success" ? "success" : "failure",
    paymentId: String(v.paymentId ?? ""),
    conversationId: String(v.conversationId ?? ""),
    paidPriceKurus: roundHalfUp(Number(v.paidPrice ?? 0) * 100),
    installment: Number(v.installment ?? 1),
    cardLast4: v.lastFourDigits ? String(v.lastFourDigits) : undefined,
    cardBrand: v.cardAssociation ? String(v.cardAssociation) : undefined,
    merchantCommissionKurus: roundHalfUp(Number(v.merchantCommissionRateAmount ?? 0) * 100),
    errorMessage: v.errorMessage ? String(v.errorMessage) : undefined,
    raw: v,
  });
}

export async function refundPayment(params: {
  paymentTransactionId: string;
  amountKurus: Kurus;
  ip: string;
}): Promise<Result<{ status: string; refundId: string }>> {
  const res = await post<Record<string, string>>("/payment/refund", {
    locale: "tr",
    conversationId: randomUUID(),
    paymentTransactionId: params.paymentTransactionId,
    price: tl(params.amountKurus),
    ip: params.ip,
    currency: siteConfig.legal.currency,
  });
  if (!res.ok) return res;
  if (res.value.status !== "success") {
    return Err(errors.paymentFailed(res.value.errorMessage ?? "İade başarısız."));
  }
  return Ok({ status: res.value.status, refundId: res.value.paymentId ?? "" });
}

/**
 * Komisyon oranları — **sözleşmeden**, koddan değil.
 *
 * Oran sağlayıcıya, aynı sağlayıcıda anlaşmaya, taksit sayısına ve kart tipine
 * göre değişiyor. Koda gömülü bir oran ilk gün doğru olsa bile sözleşme
 * yenilendiğinde sessizce yanlışa dönerdi; yanlış oranın bedeli her tahsilatta
 * siteye eksik geçen para. Bu yüzden oran yapılandırmadan geliyor ve
 * tanımlanmadığında kartla tahsilat açılmıyor (`iyzicoFeeRates`).
 */
export interface FeeRates {
  /** Sağlayıcının **çekilen** tutar üzerinden aldığı oran (%). */
  processorPct: number;
  /** Sağlayıcının işlem başına aldığı sabit tutar (kuruş). */
  processorFixedKurus: Kurus;
  /** Platform hizmet bedeli (%), borç tutarı üzerinden. */
  platformPct: number;
}

/**
 * Yapılandırılmış iyzico komisyonu; eksik ya da anlamsızsa `null`.
 *
 * `%100` ve üstü bir oran matematiksel olarak çözümsüz: hangi tutar çekilirse
 * çekilsin siteye borcun tamamı geçmez. Böyle bir değeri kabul edip sonra
 * bölme sırasında patlamaktansa burada "bilinmiyor" saymak, hatayı ödeme
 * anından yapılandırma anına çekiyor.
 */
export function iyzicoFeeRates(): FeeRates | null {
  const c = serverEnv.iyzico();
  if (c.commissionPct === undefined || c.commissionFixedKurus === undefined) {
    return null;
  }
  if (c.commissionPct < 0 || c.commissionPct >= 100 || c.commissionFixedKurus < 0) {
    return null;
  }
  return {
    processorPct: c.commissionPct,
    processorFixedKurus: c.commissionFixedKurus,
    platformPct: serverEnv.platformFeePct(),
  };
}

/**
 * Şeffaf komisyon hesabı — SPEC Bölüm 1.2.
 *
 * `amountKurus` siteye **net** geçecek olan (borcun kendisi), `totalKurus`
 * karttan çekilecek olan. Aradaki fark sakinden alınan ek ücret ve borca
 * mahsup edilmiyor.
 */
export interface FeeBreakdown {
  /** Borç tutarı — siteye net geçmesi gereken. */
  amountKurus: Kurus;
  platformFeeKurus: Kurus;
  processorFeeKurus: Kurus;
  /** Karttan çekilecek tutar = borç + platform bedeli + sağlayıcı komisyonu. */
  totalKurus: Kurus;
}

/**
 * KOMİSYON BORCUN ÜSTÜNE EKLENİR VE **BRÜTLEŞTİRİLİR**.
 *
 * Kural: aidat 500 ₺ ise siteye 500 ₺ geçer, komisyonu sakin öder. Naif yol —
 * "500'ün komisyonunu hesapla, üstüne ekle" — bu kuralı tutturmuyor: sağlayıcı
 * komisyonu **çekilen** tutar üzerinden alıyor, dolayısıyla komisyonun kendisi
 * de komisyona tabi. %3 + 0,35 ₺ örneğinde:
 *
 *   naif:   çekilen 515,35 → sağlayıcı 15,81 alır → siteye 499,54 (54 kr eksik)
 *   brüt:   çekilen 515,82 → sağlayıcı 15,82 alır → siteye 500,00 (tam)
 *
 * Denklem `çekilen − (oran × çekilen + sabit) − platform = borç`, çözümü
 * `çekilen = (borç + platform + sabit) / (1 − oran)`.
 *
 * YUKARI YUVARLAMA (`ceil`) bilinçli: kuruş artığı sakinin lehine bölünürse
 * siteye eksik geçer. En fazla 1 kuruş fazla tahsil ediliyor ve o kuruş da
 * sitenin hesabına geçiyor — kimsenin cebinde kalmıyor.
 */
export function calculateFees(params: {
  amountKurus: Kurus;
  rates: FeeRates;
}): FeeBreakdown {
  const { amountKurus, rates } = params;

  if (rates.processorPct < 0 || rates.processorPct >= 100) {
    // Çağıran `iyzicoFeeRates` ile bunu zaten eliyor; buraya düşmek bir
    // programlama hatası, sessizce bir tutar üretmek para hatası olurdu.
    throw new Error(`[payment] Geçersiz komisyon oranı: ${rates.processorPct}`);
  }
  if (amountKurus <= 0) {
    return { amountKurus: 0, platformFeeKurus: 0, processorFeeKurus: 0, totalKurus: 0 };
  }

  const platformFeeKurus = roundHalfUp((amountKurus * rates.platformPct) / 100);
  const totalKurus = Math.ceil(
    (amountKurus + platformFeeKurus + rates.processorFixedKurus) /
      (1 - rates.processorPct / 100),
  );

  /*
   * Komisyon **artık** olarak yazılıyor, ayrıca hesaplanmıyor: böylece
   * `borç + platform + komisyon === çekilen` her zaman kuruşu kuruşuna
   * tutuyor. İki ayrı yuvarlamayla hesaplansaydı ekrandaki kalemler toplamı
   * ödenecek tutarı tutmayabilirdi — şeffaflık vaadinin en görünür bozulması.
   */
  const processorFeeKurus = totalKurus - amountKurus - platformFeeKurus;

  return { amountKurus, platformFeeKurus, processorFeeKurus, totalKurus };
}
