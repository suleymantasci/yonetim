import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { siteConfig } from "@yonetim/config";
import type { Permission, Role, TenantStatus } from "@yonetim/core";
import { ThemeToggle, type ThemePreference } from "@yonetim/ui";

import { LocaleSwitcher } from "@/components/locale-switcher";

/** Uygulama kabuğu — SPEC Bölüm 11.4 (sol menü + üst bar + içerik). */
export interface NavItem {
  href: string;
  /** `app.nav.<key>` çeviri anahtarı. */
  key: string;
  permission: Permission;
  group: NavGroup;
}

type NavGroup = "general" | "property" | "finance" | "communication" | "operations" | "compliance";

export const NAV_ITEMS: NavItem[] = [
  { href: "/panel", key: "dashboard", permission: "tenant:read", group: "general" },
  { href: "/panel/birimler", key: "units", permission: "unit:read", group: "property" },
  { href: "/panel/sakinler", key: "residents", permission: "resident:read", group: "property" },
  { href: "/panel/gecis", key: "migration", permission: "unit:write", group: "property" },
  { href: "/panel/aidat", key: "duesPlans", permission: "dues:read", group: "finance" },
  { href: "/panel/borclar", key: "debts", permission: "debt:read", group: "finance" },
  { href: "/panel/borcu-yoktur", key: "certificate", permission: "debt:read", group: "finance" },
  { href: "/panel/giderler", key: "expenses", permission: "expense:read", group: "finance" },
  { href: "/panel/banka", key: "bank", permission: "bank:read", group: "finance" },
  { href: "/panel/simulator", key: "simulator", permission: "dues:simulate", group: "finance" },
  { href: "/panel/duyurular", key: "announcements", permission: "announcement:read", group: "communication" },
  { href: "/panel/anketler", key: "polls", permission: "poll:read", group: "communication" },
  { href: "/panel/toplantilar", key: "meetings", permission: "meeting:read", group: "communication" },
  { href: "/panel/mesajlar", key: "messages", permission: "message:read", group: "communication" },
  { href: "/panel/talepler", key: "requests", permission: "request:read", group: "operations" },
  { href: "/panel/bakim", key: "maintenance", permission: "maintenance:read", group: "operations" },
  { href: "/panel/sayaclar", key: "meters", permission: "meter:read", group: "operations" },
  { href: "/panel/rezervasyon", key: "reservations", permission: "reservation:read", group: "operations" },
  { href: "/panel/personel", key: "staff", permission: "staff:read", group: "operations" },
  { href: "/panel/belgeler", key: "documents", permission: "document:read", group: "operations" },
  { href: "/panel/hukuk", key: "legal", permission: "legal:read", group: "compliance" },
  { href: "/panel/kvkk", key: "kvkk", permission: "kvkk:read", group: "compliance" },
  { href: "/panel/denetim", key: "audit", permission: "audit:read", group: "compliance" },
  { href: "/panel/raporlar", key: "reports", permission: "report:read", group: "compliance" },
  { href: "/panel/ayarlar", key: "settings", permission: "settings:read", group: "general" },
];

const GROUP_ORDER: NavGroup[] = [ "general", "property", "finance", "communication", "operations", "compliance",
];

export async function AppShell({
  children,
  tenantName,
  tenantStatus,
  userName,
  roles,
  allowedHrefs,
  impersonated,
  themePreference,
}: {
  children: ReactNode;
  tenantName: string;
  tenantStatus: string;
  userName: string;
  roles: Role[];
  allowedHrefs: string[];
  impersonated?: boolean;
  themePreference: ThemePreference;
}) {
  const t = await getTranslations("app");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: NAV_ITEMS.filter((i) => i.group === group && allowedHrefs.includes(i.href)),
  })).filter((g) => g.items.length > 0);

  const primaryRole = roles[0];

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-fg">
            {siteConfig.brand.shortName.charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{tenantName}</div>
            <div className="text-xs text-fg-subtle">
              {tEnum(`tenantStatus.${tenantStatus as TenantStatus}`)}
            </div>
          </div>
        </div>

        <nav aria-label={tCommon("a11y.modules")} className="space-y-4 p-3">
          {grouped.map((g) => (
            <div key={g.group}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                {t(`nav.group.${g.group}`)}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-lg px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
                    >
                      {t(`nav.${item.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <Link href="/panel" className="font-heading font-bold text-fg lg:hidden">
            {tenantName}
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-fg-muted md:block">
              {userName}
              {primaryRole ? (
                <span className="ml-2 rounded bg-surface-sunken px-1.5 py-0.5 text-[11px]">
                  {tEnum(`role.${primaryRole}`)}
                </span>
              ) : null}
            </span>
            <LocaleSwitcher className="hidden sm:inline-flex" />
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
          </div>
        </header>

        {impersonated ? (
          <div className="bg-warning px-4 py-2 text-sm font-semibold text-accent-fg">
            {t("shell.impersonationWarning")}
          </div>
        ) : null}

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-extrabold text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
