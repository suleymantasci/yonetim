"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { notifications, withTenant } from "@yonetim/db";

import { requireContext } from "@/lib/context";

/**
 * Bildirim okundu işaretleme.
 *
 * Kasıtlı olarak yetki kontrolü yapılmıyor: bir kullanıcı yalnız **kendi**
 * bildirimini işaretleyebilir; sorgu `userId = ctx.userId` ile sınırlı ve
 * RLS tenant'ı ayrıca kısıtlıyor. Ek bir izin adı üretmek yanlış güvenlik
 * hissi verirdi.
 */
export async function markNotificationRead(id: string): Promise<void> {
  const ctx = await requireContext();
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        );
    },
    { userId: ctx.userId },
  );
  revalidatePath("/panel");
}

export async function markAllNotificationsRead(): Promise<void> {
  const ctx = await requireContext();
  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.channel, "in_app"),
            eq(notifications.userId, ctx.userId),
            isNull(notifications.readAt),
          ),
        );
    },
    { userId: ctx.userId },
  );
  revalidatePath("/panel");
}
