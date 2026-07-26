export * from "./iyzico";
export * from "./paytr";
export * from "./receipt";

import { isIyzicoConfigured } from "./iyzico";
import { isPaytrConfigured } from "./paytr";

export type PaymentProviderName = "iyzico" | "paytr" | "param" | "manual";

/**
 * Aktif ödeme sağlayıcısı seçimi — SPEC Bölüm 7.1.
 * Başlangıç: iyzico. Downtime'da PayTR yedeği (Bölüm 3.10).
 */
export function selectPaymentProvider(
  opts: { preferred?: PaymentProviderName; iyzicoHealthy?: boolean } = {},
): PaymentProviderName {
  const healthy = opts.iyzicoHealthy ?? true;
  if (opts.preferred === "paytr" && isPaytrConfigured()) return "paytr";
  if (isIyzicoConfigured() && healthy) return "iyzico";
  if (isPaytrConfigured()) return "paytr";
  return "manual";
}
