import type { Permission } from "@yonetim/core";

import { audit, logDataAccess } from "./audit";
import { requirePermission, type AppContext } from "./context";

/**
 * Kişisel veri içeren ekranlar için yetki + erişim kaydı (KVKK md.12).
 * Yetki kontrolünü yapar ve ekran açılışını denetim kütüğüne yazar.
 */
export async function requirePermissionWithLog(
  permission: Permission,
  resource = "screen",
): Promise<AppContext> {
  const ctx = await requirePermission(permission);
  await audit(ctx, { action: "view", resource, reason: `Yetki: ${permission}` });
  return ctx;
}

export { logDataAccess, audit };
