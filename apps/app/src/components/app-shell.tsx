import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { siteConfig } from "@yonetim/config";
import type { Role, TenantStatus } from "@yonetim/core";
import {
  A11yMenu, Badge, BrandMark, PageHeader as UiPageHeader, ThemeToggle,
  type A11yPreferences, type ThemePreference,
} from "@yonetim/ui";

import { markAllNotificationsRead, markNotificationRead } from "@/components/shell/actions";
import { CommandPalette, type PaletteEntry } from "@/components/shell/command-palette";
import { NotificationBell } from "@/components/shell/notification-bell";
import {
  NAV_GROUP_ORDER, NAV_ITEMS, QUICK_ACTIONS, type NavBadgeKey, type NavGroup,
} from "@/components/shell/nav";
import { ShellFrame } from "@/components/shell/shell-frame";
import { TenantSwitcher } from "@/components/shell/tenant-switcher";
import type { SidebarItem } from "@/components/shell/sidebar";
import { UserMenu } from "@/components/shell/user-menu";
import { formatters } from "@/lib/format";
import {
  notificationCategory, notificationHref, type InAppNotification, type NavBadges,
} from "@/lib/shell-data";

type UiPageHeaderProps = Parameters<typeof UiPageHeader>[0];

/** Rozet acil mi — renk kararı tek yerde. */
const BADGE_TONE: Record<NavBadgeKey, "danger" | "warning" | "info"> = {
  openRequests: "info",
  slaBreached: "danger",
  kvkkPending: "warning",
  unmatchedBankTx: "warning",
  overdueMaintenance: "danger",
};

export { NAV_ITEMS };

/**
 * Uygulama kabuğu — SPEC Bölüm 11.4, GAP 4.4.
 *
 * Sunucu bileşeni: çeviriler, rozet sayıları ve bildirimler burada çözülür,
 * istemciye yalnız hazır metin gider. Etkileşim gerektiren üç parça
 * (`ShellFrame`, `CommandPalette`, `NotificationBell`) ayrı istemci
 * bileşenleridir; kabuk bir bütün olarak "use client" olmaz.
 */
export async function AppShell({
  children,
  tenantId,
  tenantName,
  tenantStatus,
  userName,
  roles,
  allowedHrefs,
  impersonated,
  themePreference,
  a11yPreferences,
  badges,
  notifications,
  unreadNotificationCount,
  memberships,
}: {
  children: ReactNode;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  userName: string;
  roles: Role[];
  allowedHrefs: string[];
  impersonated?: boolean;
  themePreference: ThemePreference;
  a11yPreferences: A11yPreferences;
  badges: NavBadges;
  notifications: InAppNotification[];
  unreadNotificationCount: number;
  /** Kullanıcının erişebildiği siteler — site değiştirici için. */
  memberships: { id: string; slug: string; name: string }[];
}) {
  const t = await getTranslations("app");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const allowed = new Set(allowedHrefs);

  const sidebarItems: SidebarItem[] = NAV_ITEMS.filter((item) => allowed.has(item.href)).map(
    (item) => ({
      href: item.href,
      key: item.key,
      label: t(`nav.${item.key}`),
      group: item.group,
      badgeCount: item.badge ? badges[item.badge] : undefined,
      badgeTone: item.badge ? BADGE_TONE[item.badge] : undefined,
    }),
  );

  const groupLabels = Object.fromEntries(
    NAV_GROUP_ORDER.map((group) => [group, t(`nav.group.${group}`)]),
  ) as Record<NavGroup, string>;

  // Komut paleti girdileri: sayfalar + hızlı işlemler (yalnız yetkili olanlar).
  const paletteEntries: PaletteEntry[] = [
    ...QUICK_ACTIONS.filter((action) => allowed.has(quickActionOwner(action.href))).map(
      (action) => ({
        id: `action-${action.key}`,
        label: t(`nav.quick.${action.key}`),
        group: tCommon("action.add"),
        href: action.href,
        kind: "action" as const,
      }),
    ),
    ...sidebarItems.map((item) => ({
      id: `page-${item.key}`,
      label: item.label,
      group: groupLabels[item.group],
      href: item.href,
      kind: "page" as const,
    })),
  ];

  /**
   * Kenar çubuğu başlığı: marka işareti + **hangi sitedeyim** bilgisi.
   *
   * "Yanlış sitede işlem yapmak" bu üründeki en pahalı kullanıcı hatası; site
   * adı bu yüzden en üstte ve durumuyla birlikte duruyor.
   *
   * Birden fazla üyeliği olan kullanıcıda ad artık bir **seçici**: `memberships`
   * ve `switchTenant()` baştan beri yazılıydı ama hiçbir ekrana bağlı değildi,
   * yani çoklu site yöneten biri site değiştirmek için çıkış yapıp yeniden
   * girmek zorundaydı. Tek üyelikte düz metin kalıyor — seçeneksiz bir açılır
   * menü, olmayan bir karar sunmaktan başka işe yaramaz.
   */
  const multiTenant = memberships.length > 1;

  const brandHeader = (
    <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
      <Link
        href="/panel"
        className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={siteConfig.brand.shortName}
      >
        <BrandMark size={32} />
      </Link>
      {multiTenant ? (
        <TenantSwitcher
          current={{ id: tenantId, name: tenantName }}
          memberships={memberships}
          labels={{
            trigger: t("shell.switchTenant"),
            portfolio: t("nav.portfolio"),
            status: tEnum(`tenantStatus.${tenantStatus as TenantStatus}`),
          }}
        />
      ) : (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-fg">{tenantName}</div>
          <div className="mt-0.5 text-[11px] leading-tight text-fg-subtle">
            {tEnum(`tenantStatus.${tenantStatus as TenantStatus}`)}
          </div>
        </div>
      )}
    </div>
  );

  const primaryRole = roles[0];

  return (
    <ShellFrame
      labels={{
        openMenu: tCommon("a11y.mainMenu"),
        skipToContent: tCommon("a11y.skipToContent"),
        closeToast: tCommon("action.close"),
      }}
      sidebar={{
        items: sidebarItems,
        groupLabels,
        groupOrder: NAV_GROUP_ORDER,
        header: brandHeader,
        labels: {
          modules: tCommon("a11y.modules"),
          pinned: t("shell.pinned"),
          pin: t("shell.pin"),
          unpin: t("shell.unpin"),
          close: tCommon("action.close"),
        },
      }}
      headerLeft={
        <>
          {/*
           * Palet `lg` altında tümüyle gizliydi — yani 26 sayfalık gezinmenin
           * en hızlı yolu tabletlerde hiç yoktu. Artık `sm`'den itibaren
           * görünüyor; dar ekranda düğme yalnız büyütece iniyor (kendi
           * `sm:` sınıflarıyla), site adı ise yalnız en dar ekranda kalıyor.
           */}
          <Link href="/panel" className="truncate font-heading font-bold text-fg sm:hidden">
            {tenantName}
          </Link>
          <div className="hidden sm:block">
            <CommandPalette
              entries={paletteEntries}
              labels={{
                trigger: t("shell.search"),
                placeholder: t("shell.searchPlaceholder"),
                empty: t("shell.searchEmpty"),
                pages: tCommon("a11y.modules"),
                actions: tCommon("action.add"),
                hintOpen: t("shell.searchHint"),
                close: tCommon("action.close"),
              }}
            />
          </div>
        </>
      }
      headerRight={
        <>
          {tenantStatus !== "active" ? (
            <Badge tone={tenantStatus === "trial" ? "info" : "warning"} className="hidden sm:inline-flex">
              {tEnum(`tenantStatus.${tenantStatus as TenantStatus}`)}
            </Badge>
          ) : null}

          <NotificationBell
            items={notifications.map((item) => ({
              id: item.id,
              title: item.title,
              body: item.body,
              createdAt: fmt.dateTime(item.createdAt),
              read: item.read,
              href: notificationHref(item.resourceType, item.resourceId),
              category: notificationCategory(item.resourceType),
            }))}
            unreadCount={unreadNotificationCount}
            markAllRead={markAllNotificationsRead}
            markRead={markNotificationRead}
            labels={{
              trigger: t("shell.notifications"),
              title: t("shell.notifications"),
              empty: t("shell.notificationsEmpty"),
              markAll: t("shell.markAllRead"),
              viewAll: tCommon("action.viewAll"),
              category: {
                debt: t("nav.debts"),
                request: t("nav.requests"),
                announcement: t("nav.announcements"),
                system: t("shell.categorySystem"),
              },
            }}
          />

          <A11yMenu
            initial={a11yPreferences}
            labels={{
              trigger: t("shell.a11y"),
              fontSize: t("shell.fontSize"),
              scale: {
                sm: t("shell.fontScale.sm"),
                md: t("shell.fontScale.md"),
                lg: t("shell.fontScale.lg"),
                xl: t("shell.fontScale.xl"),
              },
              highContrast: t("shell.highContrast"),
              reducedMotion: t("shell.reducedMotion"),
              density: t("shell.density"),
              densityOption: {
                comfortable: t("shell.densityOption.comfortable"),
                compact: t("shell.densityOption.compact"),
              },
            }}
          />

          <ThemeToggle
            initialPreference={themePreference}
            labels={{
              group: tCommon("theme.group"),
              light: tCommon("theme.light"),
              dark: tCommon("theme.dark"),
              system: tCommon("theme.system"),
            }}
          />

          <UserMenu
            userName={userName}
            roleLabel={primaryRole ? tEnum(`role.${primaryRole}`) : undefined}
            labels={{
              trigger: t("shell.userMenu"),
              logout: tCommon("action.logout"),
            }}
          />
        </>
      }
      banner={
        impersonated ? (
          <div className="bg-warning px-4 py-2 text-sm font-semibold text-accent-fg">
            {t("shell.impersonationWarning")}
          </div>
        ) : null
      }
    >
      {children}
    </ShellFrame>
  );
}

/**
 * Hızlı işlem adresinin hangi liste sayfasına ait olduğunu bulur;
 * yetki kontrolü liste sayfasının izniyle yapılır (`/panel/birimler/yeni`
 * → `/panel/birimler`). Yazma izni olmayan bir kullanıcının "yeni" bağlantısı
 * paletten hiç görünmez.
 */
function quickActionOwner(href: string): string {
  const [base] = href.split("?");
  const segments = (base ?? "").split("/").filter(Boolean);
  return `/${segments.slice(0, 2).join("/")}`;
}

/**
 * Sayfa başlığı bloğu — artık `packages/ui`'de (`components/page-header.tsx`).
 *
 * Burada yalnız Next `Link`'i enjekte eden ince bir sarmalayıcı kaldı: 40'a
 * yakın sayfa `@/components/app-shell`'den `PageHeader` alıyor ve hepsini
 * dolaşmak yerine ithal yolu korundu. Kırıntı yolunun `Link` kullanması
 * gezinmenin istemci tarafında kalması için önemli.
 */
export function PageHeader(props: Omit<UiPageHeaderProps, "linkComponent">) {
  return <UiPageHeader {...props} linkComponent={Link} />;
}
