import { cookies } from "next/headers";

import { hasPermission } from "@yonetim/auth";
import { parseThemePreference, THEME_COOKIE } from "@yonetim/ui";

import { AppShell, NAV_ITEMS } from "@/components/app-shell";
import { requireContext } from "@/lib/context";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const cookieStore = await cookies();

  const allowedHrefs = NAV_ITEMS.filter((item) => hasPermission(ctx.roles, item.permission)).map(
    (i) => i.href,
  );

  const userName =
    [ctx.session.user.firstName, ctx.session.user.lastName].filter(Boolean).join(" ") ||
    ctx.session.user.email || "";

  return (
    <AppShell
      tenantName={ctx.tenantName}
      tenantStatus={ctx.tenantStatus}
      userName={userName}
      roles={ctx.roles}
      allowedHrefs={allowedHrefs}
      impersonated={Boolean(ctx.impersonatedBy)}
      themePreference={parseThemePreference(cookieStore.get(THEME_COOKIE)?.value)}
    >
      {children}
    </AppShell>
  );
}
