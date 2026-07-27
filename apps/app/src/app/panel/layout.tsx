import { cookies } from "next/headers";

import { hasPermission } from "@yonetim/auth";
import {
  A11Y_COOKIE,
  parseA11y,
  parseThemePreference,
  THEME_COOKIE,
} from "@yonetim/ui";

import { AppShell } from "@/components/app-shell";
import { NAV_ITEMS } from "@/components/shell/nav";
import { requireContext } from "@/lib/context";
import { getInAppNotifications, getNavBadges } from "@/lib/shell-data";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const cookieStore = await cookies();

  const allowedHrefs = NAV_ITEMS.filter((item) =>
    hasPermission(ctx.roles, item.permission),
  ).map((i) => i.href);

  const userName =
    [ctx.session.user.firstName, ctx.session.user.lastName]
      .filter(Boolean)
      .join(" ") ||
    ctx.session.user.email ||
    "";

  // Rozetler ve bildirimler paralel çekilir: kabuk her sayfada render edildiği
  // için sıralı beklemek tüm panele gecikme bindirirdi.
  const [badges, notifications] = await Promise.all([
    getNavBadges(ctx),
    getInAppNotifications(ctx),
  ]);

  return (
    <AppShell
      tenantName={ctx.tenantName}
      tenantStatus={ctx.tenantStatus}
      userName={userName}
      roles={ctx.roles}
      allowedHrefs={allowedHrefs}
      impersonated={Boolean(ctx.impersonatedBy)}
      themePreference={parseThemePreference(
        cookieStore.get(THEME_COOKIE)?.value,
      )}
      a11yPreferences={parseA11y(cookieStore.get(A11Y_COOKIE)?.value)}
      badges={badges}
      notifications={notifications.items}
      unreadNotificationCount={notifications.unreadCount}
    >
      {children}
    </AppShell>
  );
}
