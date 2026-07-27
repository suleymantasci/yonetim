"use server";

import { revalidatePath } from "next/cache";

import { apiPost } from "@/lib/api/server";

/**
 * Bildirim okundu işaretleme.
 *
 * Yetki adı yok ve olmamalı: kullanıcı yalnız **kendi** bildirimini
 * işaretleyebiliyor. API tarafındaki sorgu `userId = ctx.userId` ile sınırlı
 * ve RLS tenant'ı ayrıca kısıtlıyor; ek bir izin adı üretmek yanlış bir
 * güvenlik hissi verirdi — kısıtlama izinde değil, sorgunun kendisinde.
 */
export async function markNotificationRead(id: string): Promise<void> {
  await apiPost("/v1/panel/notifications/read", { id });
  revalidatePath("/panel");
}

export async function markAllNotificationsRead(): Promise<void> {
  // `id` yok = okunmamışların tümü.
  await apiPost("/v1/panel/notifications/read", {});
  revalidatePath("/panel");
}
