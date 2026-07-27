import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  notificationReadRequest,
  type InAppNotificationList,
  type NotificationReadRequest,
} from "@yonetim/contracts";
import { notifications } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";
import { ZodBodyPipe } from "../infra/zod/zod-dto";

/**
 * Uygulama içi bildirimler — `/v1/panel/notifications`.
 *
 * `@RequirePermission` YOK ve bu bilinçli: kullanıcı yalnız **kendi**
 * bildirimini görüyor, sorgular `userId = ctx.userId` ile sınırlı ve RLS
 * tenant'ı ayrıca kısıtlıyor. Ayrı bir izin adı icat etmek yanlış bir güvenlik
 * hissi verirdi — kısıtlama izinde değil, sorgunun kendisinde.
 *
 * Guard zinciri yine de çalışıyor: `@Public()` verilmediği için kimliksiz
 * istek buraya hiç ulaşmıyor.
 */
@ApiTags("panel/notifications")
@Controller("v1/panel/notifications")
export class NotificationController {
  constructor(private readonly db: DbService) {}

  @Get()
  @ApiOperation({ summary: "Son 20 bildirim + okunmamış sayısı" })
  async list(): Promise<InAppNotificationList> {
    const ctx = this.db.ctx();
    const userId = ctx.userId;
    // Kullanıcısız kimlik yolları (API anahtarı, iç token) için bildirim
    // kavramı yok: boş liste, hata değil.
    if (!userId) return { items: [], unreadCount: 0 };

    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          id: notifications.id,
          subject: notifications.subject,
          body: notifications.body,
          createdAt: notifications.createdAt,
          readAt: notifications.readAt,
          resourceType: notifications.resourceType,
          resourceId: notifications.resourceId,
          template: notifications.template,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.channel, "in_app"),
            eq(notifications.userId, userId),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(20);

      const [unread] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.channel, "in_app"),
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
          ),
        );

      return {
        items: rows.map((row) => ({
          id: row.id,
          // Konu boşsa şablon adı gösteriliyor: başlıksız bir satır,
          // kullanıcının neye tıkladığını bilmediği bir satır olurdu.
          title: row.subject ?? row.template,
          body: row.body,
          createdAt: row.createdAt,
          read: row.readAt !== null,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
        })),
        unreadCount: Number(unread?.value ?? 0),
      };
    });
  }

  @Post("read")
  @HttpCode(204)
  @ApiOperation({
    summary: "Okundu işaretle",
    description: "`id` verilmezse okunmamışların tümü işaretlenir.",
  })
  async markRead(
    @Body(new ZodBodyPipe(notificationReadRequest)) dto: NotificationReadRequest,
  ): Promise<void> {
    const ctx = this.db.ctx();
    const userId = ctx.userId;
    if (!userId) return;

    await this.db.tx(async (tx) => {
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.channel, "in_app"),
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            // `id` verildiyse tek kayıt; yoksa koşul düşer ve tümü işaretlenir.
            ...(dto.id ? [eq(notifications.id, dto.id)] : []),
          ),
        );
    });
  }
}
