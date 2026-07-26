import type { Role } from "./rbac";

/** İstek bağlamı — her server action / route handler bunu taşır (Bölüm 13.3). */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  roles: Role[];
  /** Süper admin başka bir kullanıcı adına işlem yapıyorsa (Bölüm 18.2). */
  impersonatedBy?: string;
  ip?: string;
  userAgent?: string;
  locale: string;
}

export type TenantType =
  | "apartment"
  | "site"
  | "residence"
  | "plaza"
  | "avm"
  | "office"
  | "vakif"
  | "dernek";


/**
 * Etiketler i18n katmanındadır: `enum.tenantType.<type>`,
 * `enum.tenantStatus.<status>`. Paketler dile bağımsız kalır.
 */
export type TenantStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "archived"
  | "cancelled";


export type Channel = "whatsapp" | "sms" | "email" | "push" | "in_app" | "voice";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string;
  diff?: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
}
