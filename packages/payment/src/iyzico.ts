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
  amountKurus: Kurus;
  /** Sakinden alınan platform hizmet bedeli (şeffaf gösterim — Bölüm 1.2). */
  platformFeeKurus?: Kurus;
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
  const total = req.amountKurus + (req.platformFeeKurus ?? 0);
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
 * Şeffaf komisyon hesabı — SPEC Bölüm 1.2.
 * Sakine ödeme ekranında "X ₺ platform ücreti + Y ₺ banka komisyonu" ayrı gösterilir.
 */
export interface FeeBreakdown {
  amountKurus: Kurus;
  platformFeeKurus: Kurus;
  processorFeeKurus: Kurus;
  totalKurus: Kurus;
  /**
   * Açıklama i18n katmanındadır: `app.payment.feeByManagement` veya
   * `app.payment.feeByResident`.
   */
  paidBy: "resident" | "management";
}

export function calculateFees(params: {
  amountKurus: Kurus;
  /** Platform hizmet bedeli oranı (%). Varsayılan 0 — aidat tahsilatında ücret almıyoruz. */
  platformFeePct?: number;
  /** iyzico komisyonu: %3.49 + 0.35 ₺ (Bölüm 7.1). */
  processorPct?: number;
  processorFixedKurus?: Kurus;
  /** Komisyonu sakin mi yönetim mi karşılıyor. */
  paidBy?: "resident" | "management";
}): FeeBreakdown {
  const platform = roundHalfUp((params.amountKurus * (params.platformFeePct ?? 0)) / 100);
  const processor =
    roundHalfUp((params.amountKurus * (params.processorPct ?? 3.49)) / 100) +
    (params.processorFixedKurus ?? 35);

  const paidBy = params.paidBy ?? "management";
  const total = paidBy === "resident" ? params.amountKurus + platform + processor : params.amountKurus;

  return {
    amountKurus: params.amountKurus,
    platformFeeKurus: platform,
    processorFeeKurus: processor,
    totalKurus: total,
    paidBy,
  };
}
