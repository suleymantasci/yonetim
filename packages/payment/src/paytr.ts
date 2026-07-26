import { createHmac } from "node:crypto";

import { serverEnv } from "@yonetim/config";
import { Err, Ok, errors, kurusToTl, type Kurus, type Result } from "@yonetim/core";

/**
 * PayTR iFrame API — SPEC Bölüm 7.1 yedek sağlayıcı.
 * iyzico downtime'ında otomatik devreye girer (Bölüm 3.10 failover).
 */
export interface PaytrTokenRequest {
  merchantOid: string;
  email: string;
  amountKurus: Kurus;
  userName: string;
  userAddress: string;
  userPhone: string;
  userIp: string;
  okUrl: string;
  failUrl: string;
  basket: { name: string; priceKurus: Kurus; count: number }[];
  installmentCount?: number;
  testMode?: boolean;
}

function creds() {
  const c = serverEnv.paytr();
  if (!c.merchantId || !c.merchantKey || !c.merchantSalt) return null;
  return c;
}

export function isPaytrConfigured(): boolean {
  return creds() !== null;
}

export async function createPaytrToken(
  req: PaytrTokenRequest,
): Promise<Result<{ token: string; iframeUrl: string }>> {
  const c = creds();
  if (!c) return Err(errors.integrationUnavailable("PayTR"));

  const basketJson = JSON.stringify(
    req.basket.map((b) => [b.name, kurusToTl(b.priceKurus).toFixed(2), b.count]),
  );
  const userBasket = Buffer.from(basketJson).toString("base64");
  const noInstallment = req.installmentCount === 1 ? "1" : "0";
  const maxInstallment = String(req.installmentCount ?? 0);
  const testMode = req.testMode ? "1" : "0";
  const currency = "TL";

  const hashStr =
    c.merchantId + req.userIp + req.merchantOid + req.email + String(req.amountKurus) +
    userBasket + noInstallment + maxInstallment + currency + testMode;
  const token = createHmac("sha256", c.merchantKey!)
    .update(hashStr + c.merchantSalt!)
    .digest("base64");

  const form = new URLSearchParams({
    merchant_id: c.merchantId!,
    user_ip: req.userIp,
    merchant_oid: req.merchantOid,
    email: req.email,
    payment_amount: String(req.amountKurus),
    paytr_token: token,
    user_basket: userBasket,
    debug_on: "0",
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: req.userName,
    user_address: req.userAddress,
    user_phone: req.userPhone,
    merchant_ok_url: req.okUrl,
    merchant_fail_url: req.failUrl,
    timeout_limit: "30",
    currency,
    test_mode: testMode,
  });

  try {
    const r = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const json = (await r.json()) as { status: string; token?: string; reason?: string };
    if (json.status !== "success" || !json.token) {
      return Err(errors.paymentFailed(json.reason ?? "PayTR token alınamadı."));
    }
    return Ok({ token: json.token, iframeUrl: `https://www.paytr.com/odeme/guvenli/${json.token}` });
  } catch (error) {
    return Err(errors.integrationUnavailable(`PayTR (${(error as Error).message})`));
  }
}

/** PayTR bildirim (callback) imza doğrulaması. */
export function verifyPaytrCallback(params: {
  merchantOid: string;
  status: string;
  totalAmount: string;
  hash: string;
}): boolean {
  const c = creds();
  if (!c) return false;
  const expected = createHmac("sha256", c.merchantKey!)
    .update(params.merchantOid + c.merchantSalt! + params.status + params.totalAmount)
    .digest("base64");
  return expected === params.hash;
}
