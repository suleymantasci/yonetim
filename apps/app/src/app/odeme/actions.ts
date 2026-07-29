"use server";

import { redirect } from "next/navigation";

import { portalCheckoutResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";

/**
 * Ödeme başlatma — SPEC Bölüm 7.1 / Faz 4.
 *
 * Kayıt açma, komisyon hesabı, uygunluk kontrolü, hız sınırı ve denetim
 * kaydı `apps/api`'de. Burada kalan tek iş hosted checkout adresine
 * yönlendirmek. Kartla ödeme kapalıysa bu eylem hiç çağrılmıyor: ödeme
 * ekranı o durumda havale bilgilerini gösteriyor, düğmeyi değil.
 *
 * Gövde boş gönderiliyor — tutarı sunucu açık borçlardan türetiyor. Ekrandan
 * tutar taşımak, ödenecek miktarı istemciye belirletmek olurdu.
 */
export async function startCheckout(): Promise<void> {
  const result = await apiPost("/v1/panel/portal/payment", {}, portalCheckoutResult);

  // `paymentPageUrl` dış bir adres: `redirect()` bunu 307 ile döndürüyor.
  redirect(result.paymentPageUrl);
}
