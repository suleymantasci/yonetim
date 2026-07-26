/**
 * RBAC — SPEC Bölüm 14.2 / 18.
 * Roller tenant kapsamlıdır; `super_admin` platform kapsamlıdır (tenant_id null).
 */
export const ROLES = [
  "super_admin", // Platform ekibi (Bölüm 18)
  "support_agent", // Platform destek (kısıtlı, impersonate loglu)
  "company_admin", // Yönetim şirketi sahibi (çoklu tenant)
  "company_operator", // Yönetim şirketi operasyon personeli
  "manager", // Site yöneticisi
  "auditor", // Denetçi (Yonetimcell'de ek modül — bizde standart)
  "accountant", // Muhasebe (finans salt okuma + gider girişi)
  "staff", // Kapıcı/güvenlik/temizlik
  "owner", // Malik
  "tenant_resident", // Kiracı
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "tenant:read", "tenant:update", "tenant:delete", "tenant:billing",
  "unit:read", "unit:write",
  "resident:read", "resident:write", "resident:invite",
  "dues:read", "dues:write", "dues:simulate",
  "debt:read", "debt:read_own", "debt:write", "debt:forgive",
  "payment:read", "payment:read_own", "payment:create", "payment:refund",
  "expense:read", "expense:write", "expense:approve",
  "bank:read", "bank:write", "bank:reconcile",
  "announcement:read", "announcement:write", "announcement:send_urgent",
  "poll:read", "poll:write", "poll:vote",
  "meeting:read", "meeting:write",
  "request:read", "request:read_own", "request:write", "request:assign",
  "maintenance:read", "maintenance:write",
  "reservation:read", "reservation:write", "reservation:approve",
  "document:read", "document:write",
  "meter:read", "meter:write",
  "staff:read", "staff:write", "staff:payroll",
  "legal:read", "legal:write",
  "message:read", "message:write",
  "report:read", "report:export",
  "nps:read",
  "kvkk:read", "kvkk:manage", "kvkk:export_own",
  "audit:read",
  "settings:read", "settings:write",
  "admin:tenants", "admin:users", "admin:billing", "admin:campaigns",
  "admin:flags", "admin:impersonate", "admin:health",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const RESIDENT_BASE: Permission[] = [
  "tenant:read",
  "unit:read",
  "debt:read_own",
  "payment:read_own",
  "payment:create",
  "announcement:read",
  "poll:read",
  "poll:vote",
  "meeting:read",
  "request:read_own",
  "request:write",
  "reservation:read",
  "reservation:write",
  "document:read",
  "message:read",
  "message:write",
  "kvkk:export_own",
];

const MANAGER_PERMS: Permission[] = [
  "tenant:read", "tenant:update", "tenant:billing",
  "unit:read", "unit:write",
  "resident:read", "resident:write", "resident:invite",
  "dues:read", "dues:write", "dues:simulate",
  "debt:read", "debt:write", "debt:forgive",
  "payment:read", "payment:create", "payment:refund",
  "expense:read", "expense:write", "expense:approve",
  "bank:read", "bank:write", "bank:reconcile",
  "announcement:read", "announcement:write", "announcement:send_urgent",
  "poll:read", "poll:write",
  "meeting:read", "meeting:write",
  "request:read", "request:write", "request:assign",
  "maintenance:read", "maintenance:write",
  "reservation:read", "reservation:write", "reservation:approve",
  "document:read", "document:write",
  "meter:read", "meter:write",
  "staff:read", "staff:write", "staff:payroll",
  "legal:read", "legal:write",
  "message:read", "message:write",
  "report:read", "report:export",
  "nps:read",
  "kvkk:read", "kvkk:manage",
  "audit:read",
  "settings:read", "settings:write",
];

const READ_ONLY_FINANCE: Permission[] = [
  "tenant:read", "unit:read", "resident:read",
  "dues:read", "debt:read", "payment:read",
  "expense:read", "bank:read", "report:read", "report:export",
  "document:read", "audit:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  support_agent: [
    ...READ_ONLY_FINANCE,
    "admin:tenants", "admin:users", "admin:health", "kvkk:read", "audit:read",
  ],
  company_admin: MANAGER_PERMS,
  company_operator: MANAGER_PERMS.filter(
    (p) => !["tenant:billing", "debt:forgive", "payment:refund", "staff:payroll"].includes(p),
  ),
  manager: MANAGER_PERMS,
  auditor: [...READ_ONLY_FINANCE, "meeting:read", "poll:read", "maintenance:read", "legal:read"],
  accountant: [
    ...READ_ONLY_FINANCE,
    "expense:write", "payment:create", "bank:reconcile", "meter:read", "meter:write",
  ],
  staff: [
    "tenant:read", "unit:read", "request:read", "request:write",
    "maintenance:read", "maintenance:write", "document:read", "message:read", "message:write",
  ],
  owner: [...RESIDENT_BASE, "meeting:read"],
  tenant_resident: RESIDENT_BASE,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAny(roles: Role[], permission: Permission): boolean {
  return roles.some((r) => can(r, permission));
}

export function isPlatformRole(role: Role): boolean {
  return role === "super_admin" || role === "support_agent";
}

export function isResidentRole(role: Role): boolean {
  return role === "owner" || role === "tenant_resident";
}

/**
 * Rol etiketleri i18n katmanındadır (`enum.role.<role>`); paket dile bağımsızdır.
 * Bu sayede yeni bir dil eklemek kod değişikliği gerektirmez.
 */
export const ROLE_MESSAGE_PREFIX = "enum.role" as const;
