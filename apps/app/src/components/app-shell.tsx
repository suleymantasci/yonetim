import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { siteConfig } from "@yonetim/config";
import type { Role, TenantStatus } from "@yonetim/core";
import {
  A11yMenu, Badge, Breadcrumb, ThemeToggle, type A11yPreferences, type Crumb,
  type ThemePreference,
} from "@yonetim/ui";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { markAllNotificationsRead, markNotificationRead } from "@/components/shell/actions";
import { CommandPalette, type PaletteEntry } from "@/components/shell/command-palette";
import { NotificationBell } from "@/components/shell/notification-bell";
import {
  NAV_GROUP_ORDER, NAV_ITEMS, QUICK_ACTIONS, type NavBadgeKey, type NavGroup,
} from "@/components/shell/nav";
import { ShellFrame } from "@/components/shell/shell-frame";
import type { SidebarItem } from "@/components/shell/sidebar";
import { formatters } from "@/lib/format";
import {
  notificationCategory, notificationHref, type InAppNotification, type NavBadges,
} from "@/lib/shell-data";

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
}: {
  children: ReactNode;
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

  const brandHeader = (
    <div className="flex h-16 items-center gap-2 border-b border-border px-4">
      <Link
        href="/panel"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg"
        aria-label={siteConfig.brand.shortName}
      >
        {siteConfig.brand.shortName.charAt(0)}
      </Link>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-fg">{tenantName}</div>
        <div className="text-xs text-fg-subtle">
          {tEnum(`tenantStatus.${tenantStatus as TenantStatus}`)}
        </div>
      </div>
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
          <Link href="/panel" className="truncate font-heading font-bold text-fg lg:hidden">
            {tenantName}
          </Link>
          <div className="hidden lg:block">
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

          <span className="hidden text-sm text-fg-muted xl:block">
            {userName}
            {primaryRole ? (
              <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-[11px]">
                {tEnum(`role.${primaryRole}`)}
              </span>
            ) : null}
          </span>

          <LocaleSwitcher className="hidden sm:inline-flex" />

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

          <form action="/api/oturum/cikis" method="post">
            <button className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-hover">
              {tCommon("action.logout")}
            </button>
          </form>
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
 * Sayfa başlığı bloğu — breadcrumb + başlık + açıklama + birincil aksiyon.
 *
 * GAP 4.3.1: her liste/detay sayfasının sağ üstünde birincil aksiyon
 * (`Yeni Birim`, `Yeni Gider`) ve derin sayfalarda breadcrumb bulunmalı.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
  meta,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: Crumb[];
  /** Başlığın yanında rozet/durum bilgisi. */
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb items={breadcrumb} linkComponent={Link as never} />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-extrabold text-fg">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
