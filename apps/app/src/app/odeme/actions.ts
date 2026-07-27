"use server";

import { redirect } from "next/navigation";

import { portalCheckoutResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";

/**
 * Ödeme başlatma — SPEC Bölüm 7.1 / Faz 4.
 *
 * Kayıt açma, komisyon hesabı, hız sınırı ve denetim kaydı `apps/api`'de.
 * Burada kalan tek iş yönlendirme: hosted checkout adresine ya da sağlayıcı
 * yapılandırılmamışsa havale talimatına.
 *
 * Gövde boş gönderiliyor — tutarı sunucu açık borçlardan türetiyor. Ekrandan
 * tutar taşımak, ödenecek miktarı istemciye belirletmek olurdu.
 */
export async function startCheckout(): Promise<void> {
  const result = await apiPost("/v1/panel/portal/payment", {}, portalCheckoutResult);

  if (result.fallback === "bank_transfer") {
    redirect(`/odeme/havale?ref=${result.conversationId}`);
  }

  // `paymentPageUrl` dış bir adres: `redirect()` bunu 307 ile döndürüyor.
  redirect(result.paymentPageUrl!);
}
