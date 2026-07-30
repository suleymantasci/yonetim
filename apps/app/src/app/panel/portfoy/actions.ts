"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";

/**
 * Aktif siteyi değiştirir.
 *
 * `runAction` kullanılmıyor: bu bir form kaydı değil, bir gezinme. Başarıda
 * dönecek bir "kaydedildi" mesajı yok — kullanıcı zaten yeni sitenin panelinde
 * uyanıyor. Yetki kontrolü de burada değil, uçta: üyeliği olmayan bir site 403
 * döner ve o karar `apps/api`'nin (MIMARI-PLAN §8.1).
 *
 * Bütün panel yolları geçersiz kılınıyor, çünkü değişen şey tek bir sayfanın
 * verisi değil, tüm panelin baktığı site.
 */
export async function switchTenant(formData: FormData): Promise<void> {
  const tenantId = z.string().uuid().parse(formData.get("tenantId"));

  await apiPost("/v1/auth/web/switch-tenant", { tenantId }, z.unknown());

  redirect("/panel");
}
