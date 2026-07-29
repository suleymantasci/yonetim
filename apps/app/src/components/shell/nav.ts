import { hasPermission } from "@yonetim/auth/guard";
import { isResidentRole, type Permission, type Role } from "@yonetim/core";

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

/**
 * Menü öğesinin kime ait olduğu.
 *
 * NEDEN İZİN YETMİYOR: sakinin `announcement:read`, `poll:read`,
 * `meeting:read`, `document:read` gibi izinleri **var** — bunlar site geneline
 * açık içerik. Ama o izinlerin işaret ettiği sayfalar yönetim ekranı: duyuru
 * sayfası besteci kutusu açıyor, mesaj sayfası sitedeki tüm yazışmayı
 * listeliyor. Yalnız izne bakan bir menü, sakine yönetim ekranlarını
 * gösteriyordu.
 *
 * Bu yüzden görünürlük iki koşula bağlı: **izin ∧ kitle**. Varsayılan
 * `["staff"]`, yani yeni bir yönetim sayfası eklendiğinde sakine sızmaz —
 * unutulduğunda güvenli tarafa düşen varsayılan bu.
 */
export type NavAudience = "staff" | "resident";

export interface NavItem {
  href: string;
  /** `app.nav.<key>` çeviri anahtarı. */
  key: string;
  permission: Permission;
  group: NavGroup;
  badge?: NavBadgeKey;
  /** Komut paletinde arama için ek anahtar kelimeler (`app.nav.keywords.<key>`). */
  searchable?: boolean;
  /** Kimin menüsünde görünür — verilmezse yalnız yönetim tarafı. */
  audience?: NavAudience[];
}

export const NAV_ITEMS: NavItem[] = [
  // Ana ekran ikisinde de var; `/panel/page.tsx` role göre yönetim
  // dashboard'unu ya da sakin özetini render ediyor.
  {
    href: "/panel",
    key: "dashboard",
    permission: "tenant:read",
    group: "general",
    audience: ["staff", "resident"],
  },

  /* ------------------------------------------------------------ sakin */
  {
    href: "/panel/borclarim",
    key: "myDebts",
    permission: "debt:read_own",
    group: "finance",
    audience: ["resident"],
  },
  {
    href: "/panel/odemelerim",
    key: "myPayments",
    permission: "payment:read_own",
    group: "finance",
    audience: ["resident"],
  },
  {
    href: "/panel/taleplerim",
    key: "myRequests",
    permission: "request:read_own",
    group: "operations",
    audience: ["resident"],
  },
  {
    href: "/panel/mesajlarim",
    key: "myMessages",
    permission: "message:read_own",
    group: "communication",
    audience: ["resident"],
  },
  /*
   * Oylama sakinde ayrı bir ekran: `/panel/anketler` yönetim ekranı ve
   * anket **açıp kapatıyor**, oy kullanmıyor. İzin de farklı — sakinde
   * `poll:vote` var, `poll:write` yok.
   */
  {
    href: "/panel/oylamalarim",
    key: "myPolls",
    permission: "poll:vote",
    group: "communication",
    audience: ["resident"],
  },
  {
    href: "/panel/bilgilerim",
    key: "myProfile",
    permission: "unit:read",
    group: "general",
    audience: ["resident"],
  },
  {
    href: "/panel/yonetim-bilgileri",
    key: "managementInfo",
    permission: "tenant:read",
    group: "general",
    audience: ["resident"],
  },

  /* ---------------------------------------------------------- yönetim */
  // Portföy yalnız birden fazla site yönetenler için anlamlı; menüde herkese
  // görünüyor ama tek siteli kullanıcıda ekran zaten tek satır gösterir.
  // Ayrı bir izin açmak yerine `tenant:read` kullanılıyor — kapsamı sorgu
  // belirliyor (yalnız üyesi olunan siteler), izin değil.
  {
    href: "/panel/portfoy",
    key: "portfolio",
    permission: "tenant:read",
    group: "general",
    audience: ["staff"],
  },
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
  // Duyuru site geneline yayın: içerik iki taraf için de aynı, değişen yalnız
  // yazma yetkisi. Ayrı bir sakin rotası açmak aynı listeyi ikinci kez
  // yazmak olurdu; sayfa besteci kutusunu `announcement:write` ile gizliyor.
  {
    href: "/panel/duyurular",
    key: "announcements",
    permission: "announcement:read",
    group: "communication",
    audience: ["staff", "resident"],
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
  { href: "/panel/demirbas", key: "inventory", permission: "inventory:read", group: "operations" },
  { href: "/panel/belgeler", key: "documents", permission: "document:read", group: "operations" },
  { href: "/panel/hukuk", key: "legal", permission: "legal:read", group: "compliance" },
  {
    href: "/panel/karar-defteri",
    key: "decisionBook",
    permission: "decision:read",
    group: "compliance",
  },
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
  { href: "/panel/personel/yeni", key: "newStaff", permission: "staff:write" },
  { href: "/panel/talepler/yeni", key: "newRequest", permission: "request:write" },
  { href: "/panel/bakim/yeni", key: "newMaintenance", permission: "maintenance:write" },
  { href: "/panel/sayaclar/okuma", key: "meterReading", permission: "meter:write" },
  { href: "/panel/rezervasyon/yeni", key: "newReservation", permission: "reservation:write" },
  { href: "/panel/anketler/yeni", key: "newPoll", permission: "poll:write" },
  { href: "/panel/toplantilar/yeni", key: "newMeeting", permission: "meeting:write" },
  { href: "/panel/mesajlar/yeni", key: "newMessage", permission: "message:write" },
  { href: "/panel/banka/hesap/yeni", key: "newBankAccount", permission: "bank:write" },
];

/**
 * Kullanıcının kitlesi — menü ve ana ekran seçimi buna bakar.
 *
 * Karma rol mümkün: bir site yöneticisi aynı zamanda o sitede malik olabilir.
 * Böyle bir kullanıcıya sakin menüsü göstermek, yönetim işini yapamaz hâle
 * getirirdi; bu yüzden **yönetim kitlesi baskın**. Kendi borcunu görmek
 * isterse `/panel/borclarim` yolu ona da açık kalıyor (izni var), yalnız
 * menüde durmuyor.
 */
export function audienceOf(roles: Role[]): NavAudience {
  return roles.length > 0 && roles.every(isResidentRole) ? "resident" : "staff";
}

/**
 * Menüde görünecek öğeler — izin **ve** kitle koşulunu birlikte uygular.
 *
 * Kabuk, komut paleti ve `allowedHrefs` hep buradan besleniyor; filtrenin tek
 * kopyası olması önemli, çünkü ikinci bir kopya er geç birinden sapardı.
 */
export function navItemsFor(roles: Role[]): NavItem[] {
  const audience = audienceOf(roles);
  return NAV_ITEMS.filter(
    (item) =>
      (item.audience ?? ["staff"]).includes(audience) &&
      hasPermission(roles, item.permission),
  );
}

/**
 * Bir yol için gezinme öğesini bulur (en uzun eşleşen önek).
 * Breadcrumb ve aktif link vurgusu bunu kullanır; `/panel/birimler/abc/duzenle`
 * gibi derin yollarda da `/panel/birimler` aktif kalır.
 */
export function matchNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
