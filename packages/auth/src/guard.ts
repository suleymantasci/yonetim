import { can, errors, isPlatformRole, type Permission, type Role, type TenantContext } from "@yonetim/core";

/** Yetki kontrolü — SPEC Bölüm 14.2 / RBAC matrisi. */
export function assertPermission(ctx: TenantContext, permission: Permission): void {
  if (!hasPermission(ctx.roles, permission)) {
    throw errors.forbidden(`Bu işlem için yetkiniz yok (${permission}).`);
  }
}

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((r) => can(r, permission));
}

/** Sakin yalnızca kendi verisine erişebilir (debt:read_own vb.). */
export function assertOwnershipOrPermission(
  ctx: TenantContext,
  resourceOwnerUserId: string | null,
  permission: Permission,
): void {
  if (resourceOwnerUserId && resourceOwnerUserId === ctx.userId) return;
  assertPermission(ctx, permission);
}

export function assertPlatformAdmin(roles: Role[]): void {
  if (!roles.some((r) => isPlatformRole(r))) {
    throw errors.forbidden("Platform yönetici yetkisi gerekiyor.");
  }
}

/** Impersonation kaydı — Bölüm 18.2 (her aksiyon ayrı loglanır). */
export function impersonationAudit(ctx: TenantContext) {
  if (!ctx.impersonatedBy) return null;
  return {
    action: "impersonated_action",
    resource: "session",
    reason: `Süper admin ${ctx.impersonatedBy}, ${ctx.userId} adına işlem yaptı.`,
  };
}
