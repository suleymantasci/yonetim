import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { isPlatformRole, type Role } from "@yonetim/core";
import { BrandMark } from "@yonetim/ui";

import { requireContext } from "@/lib/context";

import { PlatformNav } from "./platform-nav";

/**
 * Platform yönetimi kabuğu — süper admin ve destek ekibinin ekranları.
 *
 * Site panelinin kabuğu (`AppShell`) site menüsü, bildirim zili ve site
 * değiştirici taşıyor; platform ekibinin bunların hiçbirine ihtiyacı yok.
 *
 * Kapı burada da var ama asıl kapı API'de (`assertPlatformAdmin`): platform
 * rolü olmayan biri buraya gelirse boş/hatalı bir ekran yerine kendi paneline
 * gönderiliyor.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  if (!ctx.roles.some((role) => isPlatformRole(role as Role))) redirect("/panel");

  const t = await getTranslations("app.platform");
  const tCommon = await getTranslations("common");

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark size={32} className="shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-heading text-sm font-extrabold text-fg">{t("title")}</div>
              <div className="truncate text-xs text-fg-subtle">
                {siteConfig.brand.name} · {ctx.userName}
              </div>
            </div>
          </div>

          <PlatformNav
            label={t("navLabel")}
            items={[
              { href: "/yonetim", label: t("nav.overview"), exact: true },
              { href: "/yonetim/hesaplar", label: t("nav.accounts") },
              { href: "/yonetim/yoneticiler", label: t("nav.managers") },
            ]}
          />

          <form action="/api/session/logout" method="post" className="ml-auto">
            <button className="h-9 rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-hover">
              {tCommon("action.logout")}
            </button>
          </form>
        </div>
      </header>

      <main id="main">{children}</main>
    </div>
  );
}
