import { hasPermission } from "@yonetim/auth";
import type { Permission } from "@yonetim/core";

import type { RequestContext } from "../infra/cls/request-context";

/**
 * "Bu bağlam bu yetkiye sahip mi?" — tek karar noktası.
 *
 * İki kaynak var ve ikisi de unutulmaya açık: **rol yolu** (cookie, mobil,
 * worker) RBAC matrisine, **anahtar yolu** (muhasebe yazılımı) anahtarın
 * `scopes` listesine bakar. `PermissionGuard` bunu zaten yapıyordu; fonksiyon
 * olarak ayrılmasının sebebi guard'ın **yetmediği** durumlar:
 *
 * Bazı yetkiler uca değil **isteğin içeriğine** bağlı. `announcement:send_urgent`
 * böyle: aynı uç hem sıradan hem acil duyuru oluşturuyor, fark gövdedeki
 * bayrakta. Dekoratör gövdeyi göremediği için karar servise düşüyor — ama
 * "api_key ise scopes'a bak" kuralı orada yeniden yazılsaydı, iki kopya
 * zamanla ayrışırdı ve ayrışan taraf sessizce daha gevşek olurdu.
 */
export function grants(
  ctx: RequestContext | undefined,
  permission: Permission,
): boolean {
  if (!ctx) return false;
  return ctx.source === "api_key"
    ? ctx.scopes.includes(permission)
    : hasPermission(ctx.roles, permission);
}
