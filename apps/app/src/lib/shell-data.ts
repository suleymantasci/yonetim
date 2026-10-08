import {
  agendaList,
  inAppNotificationList,
  type AgendaItem,
  navBadges,
  type InAppNotificationList,
  type NavBadgesResponse,
} from "@yonetim/contracts";

import { apiGet } from "./api/server";
import type { NavBadgeKey } from "@/components/shell/nav";

/**
 * Kabuk verileri — sidebar rozetleri ve bildirim merkezi.
 *
 * Sorgular `apps/api`'de (`/v1/panel/shell/badges`, `/v1/panel/notifications`).
 * Rozetler orada **tek sorgu turunda** toplanıyor: her menü öğesi için ayrı uç
 * çağırmak panelin her sayfasında beş gereksiz hop demekti.
 *
 * `apiGet` render içi `cache()`'li olduğundan layout iki kez sorsa bile tek
 * istek gidiyor.
 */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export async function getNavBadges(): Promise<NavBadges> {
  const badges: NavBadgesResponse = await apiGet(
    "/v1/panel/shell/badges",
    navBadges,
  );
  return badges;
}

export type InAppNotification = InAppNotificationList["items"][number];

/**
 * Üst bardaki not menüsü (son 30 not). Ajanda erişilemezse menü boş açılır:
 * kabuk, yardımcı bir listenin hatası yüzünden çökmemeli.
 */
export function getAgendaNotes(): Promise<AgendaItem[]> {
  return apiGet("/v1/panel/agenda/notes", agendaList)
    .then((r) => r.rows)
    .catch(() => []);
}

/** Kullanıcının uygulama içi bildirimleri (son 20 + okunmamış sayısı). */
export function getInAppNotifications(): Promise<InAppNotificationList> {
  return apiGet("/v1/panel/notifications", inAppNotificationList);
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
    // Tahsilatın kendi detay ekranı yok; borç listesi mahsubun sonucunu
    // zaten gösteriyor.
    case "payment":
      return "/panel/borclar";
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
    case "poll":
      return "/panel/anketler";
    case "meeting":
      return "/panel/toplantilar";
    case "debt_certificate":
      return "/panel/borcu-yoktur";
    case "agenda":
      return `/panel/takvim?kayit=${resourceId}`;
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
