import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import {
  bankTransactions, kvkkRequests, maintenanceRecords, notifications, requests, withTenant,
} from "@yonetim/db";

import type { AppContext } from "./context";
import type { NavBadgeKey } from "@/components/shell/nav";

/**
 * Kabuk verileri — sidebar rozetleri ve bildirim merkezi.
 *
 * Rozetler **tek sorguda** toplanır: her menü öğesi için ayrı sorgu atmak
 * panelin her sayfasında 5 gereksiz round-trip demekti. Sayaçlar yalnız
 * yetkili olunan tablolardan gelir; RLS zaten tenant'ı sınırlar.
 */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export async function getNavBadges(ctx: AppContext): Promise<NavBadges> {
  const now = new Date();

  return withTenant(ctx.tenantId, async (tx) => {
    const [requestRow] = await tx
      .select({
        open: sql<number>`COUNT(*) FILTER (WHERE ${requests.status} IN ('open','assigned','in_progress'))`,
        breached: sql<number>`COUNT(*) FILTER (WHERE ${requests.slaDueAt} < now() AND ${requests.resolvedAt} IS NULL)`,
      })
      .from(requests)
      .where(isNull(requests.deletedAt));

    const [kvkkRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(kvkkRequests)
      .where(sql`${kvkkRequests.status} IN ('received','in_progress')`);

    const [bankRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(bankTransactions)
      .where(eq(bankTransactions.matchStatus, "unmatched"));

    const [maintRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.isActive, true),
          lt(maintenanceRecords.nextDueAt, now),
          isNull(maintenanceRecords.deletedAt),
        ),
      );

    return {
      openRequests: Number(requestRow?.open ?? 0),
      slaBreached: Number(requestRow?.breached ?? 0),
      kvkkPending: Number(kvkkRow?.value ?? 0),
      unmatchedBankTx: Number(bankRow?.value ?? 0),
      overdueMaintenance: Number(maintRow?.value ?? 0),
    };
  });
}

export interface InAppNotification {
  id: string;
  title: string;
  body: string | null;
  createdAt: Date;
  read: boolean;
  resourceType: string | null;
  resourceId: string | null;
}

/** Kullanıcının uygulama içi bildirimleri (son 20 + okunmamış sayısı). */
export async function getInAppNotifications(
  ctx: AppContext,
): Promise<{ items: InAppNotification[]; unreadCount: number }> {
  return withTenant(ctx.tenantId, async (tx) => {
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
      .where(and(eq(notifications.channel, "in_app"), eq(notifications.userId, ctx.userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    const [unread] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.channel, "in_app"),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
        ),
      );

    return {
      items: rows.map((row) => ({
        id: row.id,
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

/**
 * Bildirimin bağlı olduğu kaynağın panel adresi.
 * Bilinmeyen tür için `null` döner — bildirim yine listede görünür,
 * yalnız tıklanabilir olmaz (kırık bağlantı vermekten iyidir).
 */
export function notificationHref(
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  if (!resourceId) return null;
  switch (resourceType) {
    case "debt":
      return `/panel/borclar/${resourceId}`;
    case "request":
      return `/panel/talepler/${resourceId}`;
    case "announcement":
      return "/panel/duyurular";
    case "expense":
      return `/panel/giderler/${resourceId}`;
    case "unit":
      return `/panel/birimler/${resourceId}`;
    case "kvkk_request":
      return "/panel/kvkk";
    case "maintenance":
      return "/panel/bakim";
    default:
      return null;
  }
}

/** Bildirim kategorisini kaynak türünden çıkarır (rozet rengi/etiketi için). */
export function notificationCategory(
  resourceType: string | null,
): "debt" | "request" | "announcement" | "system" {
  if (resourceType === "debt" || resourceType === "payment") return "debt";
  if (resourceType === "request" || resourceType === "maintenance") return "request";
  if (resourceType === "announcement" || resourceType === "poll" || resourceType === "meeting") {
    return "announcement";
  }
  return "system";
}
