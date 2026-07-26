import type { Permission } from "@yonetim/core";

/**
 * Panel gezinme haritası — SPEC Bölüm 11.4.
 *
 * Tek kaynak: hem sidebar, hem komut paleti, hem breadcrumb bu listeden
 * beslenir. `permission` alanı yetkisiz öğelerin hiç render edilmemesini
 * sağlar (yalnız gizlemek değil — sunucu tarafında filtrelenir).
 *
 * `badge` alanı hangi sayacın rozete yazılacağını söyler; sayaçlar
 * `getNavBadges()` ile tek sorguda toplanır.
 */
export type NavGroup =
  | "general"
  | "property"
  | "finance"
  | "communication"
  | "operations"
  | "compliance";

export type NavBadgeKey =
  | "openRequests"
  | "slaBreached"
  | "kvkkPending"
  | "unmatchedBankTx"
  | "overdueMaintenance";

export interface NavItem {
  href: string;
  /** `app.nav.<key>` çeviri anahtarı. */
  key: string;
  permission: Permission;
  group: NavGroup;
  badge?: NavBadgeKey;
  /** Komut paletinde arama için ek anahtar kelimeler (`app.nav.keywords.<key>`). */
  searchable?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/panel", key: "dashboard", permission: "tenant:read", group: "general" },
  { href: "/panel/birimler", key: "units", permission: "unit:read", group: "property" },
  { href: "/panel/sakinler", key: "residents", permission: "resident:read", group: "property" },
  { href: "/panel/gecis", key: "migration", permission: "unit:write", group: "property" },
  { href: "/panel/aidat", key: "duesPlans", permission: "dues:read", group: "finance" },
  { href: "/panel/borclar", key: "debts", permission: "debt:read", group: "finance" },
  { href: "/panel/borcu-yoktur", key: "certificate", permission: "debt:read", group: "finance" },
  { href: "/panel/giderler", key: "expenses", permission: "expense:read", group: "finance" },
  {
    href: "/panel/banka",
    key: "bank",
    permission: "bank:read",
    group: "finance",
    badge: "unmatchedBankTx",
  },
  { href: "/panel/simulator", key: "simulator", permission: "dues:simulate", group: "finance" },
  {
    href: "/panel/duyurular",
    key: "announcements",
    permission: "announcement:read",
    group: "communication",
  },
  { href: "/panel/anketler", key: "polls", permission: "poll:read", group: "communication" },
  { href: "/panel/toplantilar", key: "meetings", permission: "meeting:read", group: "communication" },
  { href: "/panel/mesajlar", key: "messages", permission: "message:read", group: "communication" },
  {
    href: "/panel/talepler",
    key: "requests",
    permission: "request:read",
    group: "operations",
    badge: "openRequests",
  },
  {
    href: "/panel/bakim",
    key: "maintenance",
    permission: "maintenance:read",
    group: "operations",
    badge: "overdueMaintenance",
  },
  { href: "/panel/sayaclar", key: "meters", permission: "meter:read", group: "operations" },
  { href: "/panel/rezervasyon", key: "reservations", permission: "reservation:read", group: "operations" },
  { href: "/panel/personel", key: "staff", permission: "staff:read", group: "operations" },
  { href: "/panel/belgeler", key: "documents", permission: "document:read", group: "operations" },
  { href: "/panel/hukuk", key: "legal", permission: "legal:read", group: "compliance" },
  {
    href: "/panel/kvkk",
    key: "kvkk",
    permission: "kvkk:read",
    group: "compliance",
    badge: "kvkkPending",
  },
  { href: "/panel/denetim", key: "audit", permission: "audit:read", group: "compliance" },
  { href: "/panel/raporlar", key: "reports", permission: "report:read", group: "compliance" },
  { href: "/panel/ayarlar", key: "settings", permission: "settings:read", group: "general" },
];

export const NAV_GROUP_ORDER: NavGroup[] = [
  "general",
  "property",
  "finance",
  "communication",
  "operations",
  "compliance",
];

/**
 * Komut paletindeki "hızlı işlem" girdileri. Sayfa değil, doğrudan bir
 * oluşturma akışına atlar — power user için en kısa yol (GAP 4.3.1).
 */
export interface QuickAction {
  href: string;
  /** `app.nav.quick.<key>` */
  key: string;
  permission: Permission;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { href: "/panel/birimler/yeni", key: "newUnit", permission: "unit:write" },
  { href: "/panel/sakinler/yeni", key: "newResident", permission: "resident:write" },
  { href: "/panel/borclar/yeni", key: "newDebt", permission: "debt:write" },
  { href: "/panel/borclar/toplu", key: "bulkDebt", permission: "debt:write" },
  { href: "/panel/giderler/yeni", key: "newExpense", permission: "expense:write" },
  { href: "/panel/giderler/kategoriler", key: "expenseCategories", permission: "expense:write" },
  { href: "/panel/duyurular?compose=1", key: "newAnnouncement", permission: "announcement:write" },
  { href: "/panel/aidat/yeni", key: "newDuesPlan", permission: "dues:write" },
];

/**
 * Bir yol için gezinme öğesini bulur (en uzun eşleşen önek).
 * Breadcrumb ve aktif link vurgusu bunu kullanır; `/panel/birimler/abc/duzenle`
 * gibi derin yollarda da `/panel/birimler` aktif kalır.
 */
export function matchNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
