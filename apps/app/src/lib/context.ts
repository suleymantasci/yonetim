import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  hasPermission, resolveSession, SESSION_COOKIE, type ActiveSession,
} from "@yonetim/auth";
import { errors, type Permission, type Role, type TenantContext } from "@yonetim/core";
import { memberships, tenants, withBypassRls } from "@yonetim/db";

/**
 * İstek bağlamı çözümleyicisi — SPEC Bölüm 13.2/13.3.
 * Her server component ve server action bu fonksiyonlar üzerinden tenant'a erişir.
 */
export interface AppContext extends TenantContext {
  tenantName: string;
  tenantStatus: string;
  session: ActiveSession;
}

export async function getSession(): Promise<ActiveSession | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) redirect("/giris");
  return session;
}

export async function requireContext(): Promise<AppContext> {
  const session = await requireSession();
  const h = await headers();

  let tenantId = session.activeTenantId;
  const slugHeader = h.get("x-tenant-slug");

  const tenant = await withBypassRls("ctx:resolve-tenant", async (tx) => {
    if (slugHeader) {
      const rows = await tx
        .select()
        .from(tenants)
        .where(and(eq(tenants.slug, slugHeader), isNull(tenants.deletedAt)))
        .limit(1);
      if (rows[0]) return rows[0];
    }
    if (!tenantId) {
      const membership = await tx
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .where(and(eq(memberships.userId, session.user.id), isNull(memberships.deletedAt)))
        .limit(1);
      tenantId = membership[0]?.tenantId ?? null;
    }
    if (!tenantId) return null;
    const rows = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return rows[0] ?? null;
  });

  if (!tenant) redirect("/kurulum");

  // Kullanıcının bu tenant'ta üyeliği var mı? (yatay yetki kontrolü)
  const roles = await withBypassRls("ctx:roles", async (tx) => {
    const rows = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, session.user.id),
          eq(memberships.tenantId, tenant.id),
          isNull(memberships.deletedAt),
        ),
      );
    return rows.map((r) => r.role as Role);
  });

  if (roles.length === 0 && !session.user.platformRole) {
    throw errors.forbidden((await getTranslations("common.error"))("forbiddenTenant"));
  }
  if (session.user.platformRole) roles.push(session.user.platformRole);

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tenantStatus: tenant.status,
    userId: session.user.id,
    roles,
    impersonatedBy: session.impersonatedBy ?? undefined,
    ip: h.get("x-client-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    locale: session.user.locale,
    session,
  };
}

export async function requirePermission(permission: Permission): Promise<AppContext> {
  const ctx = await requireContext();
  if (!hasPermission(ctx.roles, permission)) {
    throw errors.forbidden(
      (await getTranslations("common.error"))("forbiddenPermission", { permission }),
    );
  }
  return ctx;
}

export function can(ctx: AppContext, permission: Permission): boolean {
  return hasPermission(ctx.roles, permission);
}
