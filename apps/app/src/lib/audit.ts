import { auditLogs, dataAccessLogs, withBypassRls } from "@yonetim/db";

import type { AppContext } from "./context";

/**
 * Denetim kütüğü — SPEC Bölüm 14.2 (her kritik aksiyon loglanır)
 * ve Bölüm 3.3 (kişisel veri erişim logu).
 * audit_logs append-only olduğu için DB trigger'ı UPDATE/DELETE'i engeller.
 */
export async function audit(
  ctx: AppContext,
  entry: {
    action: string;
    resource: string;
    resourceId?: string;
    diff?: Record<string, { from: unknown; to: unknown }>;
    reason?: string;
  },
): Promise<void> {
  await withBypassRls("audit:write", async (tx) => {
    await tx.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      diff: entry.diff,
      reason: entry.reason,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      impersonatedBy: ctx.impersonatedBy,
    });
  });
}

/** Kişisel veri görüntülemesi (KVKK md.12 izlenebilirlik). */
export async function logDataAccess(
  ctx: AppContext,
  params: {
    subjectUserId: string;
    dataCategory: string;
    action: "view" | "export" | "share" | "update" | "delete";
    purpose?: string;
  },
): Promise<void> {
  await withBypassRls("kvkk:data-access", async (tx) => {
    await tx.insert(dataAccessLogs).values({
      tenantId: ctx.tenantId,
      subjectUserId: params.subjectUserId,
      accessorUserId: ctx.userId,
      dataCategory: params.dataCategory,
      action: params.action,
      purpose: params.purpose,
      ip: ctx.ip,
    });
  });
}

/** İki nesne arasındaki farkı audit diff formatına çevirir. */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) diff[key] = { from: before[key], to: value };
  }
  return diff;
}
