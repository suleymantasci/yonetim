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
  /**
   * `tenant:archive` ile `tenant:delete` bilerek ayrı:
   *
   * Arşivleme **geri alınabilir** ve kararı sitenin yöneticisine ait — "bu
   * siteyle işim bitti" demek yönetimin kendi işi. Kalıcı tasfiye geri
   * alınamaz ve platformun sorumluluğunda: yanlış basılan bir düğme yüzünden
   * bir sitenin tüm aidat, borç ve karar defteri geçmişinin yok olması,
   * yöneticiye verilebilecek bir yetki değil. Tek izinle ifade edilseydi,
   * yöneticiye arşivleme hakkı vermek aynı anda silme hakkı vermek olurdu.
   */
  "tenant:read", "tenant:update", "tenant:archive", "tenant:delete", "tenant:billing",
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
  // Demirbaş defteri (KMK md.34/9) ve karar defteri — 2026-07-28 rakip
  // incelemesiyle eklendi. Ayrı izinler, çünkü ikisi de farklı sorumluluk:
  // demirbaş yöneticinin mal koruma, karar defteri kurul kararlarının
  // kaydını tutma yükümlülüğü. `document:*` altına sıkıştırmak, denetçiye
  // karar defterini açmak isterken dosya deposunu da açmayı gerektirirdi.
  "inventory:read", "inventory:write",
  "decision:read", "decision:write",
  "staff:read", "staff:write", "staff:payroll",
  "legal:read", "legal:write",
  // Tedarikçi kartı ve cari ekstresi — gider girişinden ayrı: muhasebeci
  // tedarikçi açabilmeli, denetçi yalnız okuyabilmeli.
  "vendor:read", "vendor:write",
  // Kargo ve ziyaretçi defteri: kapıcı/güvenliğin günlük işi; finans ya da
  // sakin verisi yetkisi gerektirmemeli.
  "frontdesk:read", "frontdesk:write",
  // Ajanda (takvim görev/not): kişisel çalışma aracı, sakin dışındaki her
  // panel rolünde; paylaşılan kayıt yalnız aynı sitenin ekibine görünür.
  "agenda:read", "agenda:write",
  "message:read", "message:read_own", "message:write",
  "report:read", "report:export",
  "nps:read",
  "kvkk:read", "kvkk:manage", "kvkk:export_own",
  "audit:read",
  "settings:read", "settings:write",
  "certificate:write", // Borcu yoktur belgesi üretme (M-46)
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
  /**
   * KMK md.32/son: kurul kararları karar defterine yazılır ve **her kat
   * malikince görülebilir**. Bu bir ürün tercihi değil, kanuni bir hak;
   * bu yüzden sakin rolünün temel izinleri arasında.
   *
   * Sakin yalnız *okur*; deftere yazmak yöneticinin yükümlülüğü.
   */
  "decision:read",
  "request:read_own",
  "request:write",
  "reservation:read",
  "reservation:write",
  "document:read",
  /**
   * `message:read` DEĞİL — GAP: sakinin bu izni vardı ve
   * `GET /v1/panel/communication/messages` yalnız `message:read` istiyor.
   * Yani her sakin sitedeki **tüm** yazışmaları okuyabiliyordu; ekranı
   * gizlemek yetmez, uç kendisi açıktı. Kapsam izinle daraltılıyor:
   * `message:read_own` yalnız sakinin kendi yazışmasını döndüren
   * `/v1/panel/portal/messages` ucunu açar. `debt:read_own` ve
   * `request:read_own` ile aynı desen.
   */
  "message:read_own",
  "message:write",
  "kvkk:export_own",
];

const MANAGER_PERMS: Permission[] = [
  "tenant:read", "tenant:update", "tenant:archive", "tenant:billing",
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
  "inventory:read", "inventory:write",
  "decision:read", "decision:write",
  "staff:read", "staff:write", "staff:payroll",
  "legal:read", "legal:write",
  "vendor:read", "vendor:write",
  "frontdesk:read", "frontdesk:write",
  "agenda:read", "agenda:write",
  "message:read", "message:write",
  "report:read", "report:export",
  "nps:read",
  "kvkk:read", "kvkk:manage",
  "audit:read",
  "settings:read", "settings:write",
  "certificate:write", // M-46: Manager belge üretebilir, salt okuyan accountant/debt:read rolü üretemez
];

const READ_ONLY_FINANCE: Permission[] = [
  "tenant:read", "unit:read", "resident:read",
  "dues:read", "debt:read", "payment:read",
  "expense:read", "bank:read", "report:read", "report:export",
  "document:read", "audit:read", "vendor:read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  support_agent: [
    ...READ_ONLY_FINANCE,
    "admin:tenants", "admin:users", "admin:health", "kvkk:read", "audit:read",
  ],
  company_admin: MANAGER_PERMS,
  company_operator: MANAGER_PERMS.filter(
    // `tenant:archive` operatörde yok: siteyi kapatmak firmanın ticari kararı,
    // operasyon personelinin günlük işi değil.
    (p) =>
      !["tenant:archive", "tenant:billing", "debt:forgive", "payment:refund", "staff:payroll"]
        .includes(p),
  ),
  manager: MANAGER_PERMS,
  // Denetçi karar defterini ve demirbaş listesini görmeden ibra denetimi
  // yapamaz: ikisi de yöneticinin hesap vereceği kalemler.
  auditor: [
    ...READ_ONLY_FINANCE,
    "meeting:read", "poll:read", "maintenance:read", "legal:read",
    "inventory:read", "decision:read", "agenda:read", "agenda:write",
  ],
  accountant: [
    ...READ_ONLY_FINANCE,
    "expense:write", "payment:create", "bank:reconcile", "meter:read", "meter:write",
    "vendor:write",
    // Demirbaş alış bedeli gider raporlarına giriyor; okuma yeterli.
    "inventory:read",
    "agenda:read", "agenda:write",
  ],
  staff: [
    "tenant:read", "unit:read", "request:read", "request:write",
    "maintenance:read", "maintenance:write", "document:read", "message:read", "message:write",
    "frontdesk:read", "frontdesk:write",
    // Kapıcı/teknisyen zimmetindeki ekipmanı görebilmeli; deftere yazmak
    // yönetimin işi (arıza bildirimi zaten `request:write` üzerinden).
    "inventory:read",
    "agenda:read", "agenda:write",
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

/**
 * Platform bağlamı — hiçbir siteye üye olmayan platform kullanıcısının kimliği.
 *
 * `RequestContext.tenantId` her yerde zorunlu ve RLS ona bakıyor. Platform
 * ekibinin bir site üyeliği yok; ona sahte bir site yerine **nil UUID**
 * veriliyor: hiçbir satırın `tenant_id`'si bu değer olmadığı için RLS'li her
 * okuma boş, her yazma `WITH CHECK`'te reddediliyor (fail-closed). Platform
 * uçları zaten `db.bypass` ile kendi kapısından geçiyor; site paneline girmek
 * için hesaba geçiş (impersonation) kullanılıyor.
 */
export const PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000000";
export const PLATFORM_TENANT_SLUG = "platform";

export function isPlatformContext(ctx: { tenantId: string }): boolean {
  return ctx.tenantId === PLATFORM_TENANT_ID;
}

export function isResidentRole(role: Role): boolean {
  return role === "owner" || role === "tenant_resident";
}

/**
 * Rol etiketleri i18n katmanındadır (`enum.role.<role>`); paket dile bağımsızdır.
 * Bu sayede yeni bir dil eklemek kod değişikliği gerektirmez.
 */
export const ROLE_MESSAGE_PREFIX = "enum.role" as const;
