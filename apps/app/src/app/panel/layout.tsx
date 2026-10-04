import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isPlatformContext } from "@yonetim/core";
import {
  A11Y_COOKIE,
  parseA11y,
  parseThemePreference,
  THEME_COOKIE,
} from "@yonetim/ui";

import { AppShell } from "@/components/app-shell";
import { audienceOf, navItemsFor } from "@/components/shell/nav";
import { requireContext } from "@/lib/context";
import { getInAppNotifications, getNavBadges } from "@/lib/shell-data";

/**
 * `modal` paralel rota yuvası — UI Faz 2.4.
 *
 * "Yeni kayıt" ekranları listeden açıldığında `@modal/(.)…/yeni` tarafından
 * kesiliyor ve bir çekmecede açılıyor; doğrudan adrese gidildiğinde aynı
 * `page.tsx` tam sayfa olarak çalışmaya devam ediyor. Gerekçe
 * `components/route-drawer.tsx` başlığında.
 */
export default async function PanelLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const ctx = await requireContext();
  // Siteye üye olmayan platform kullanıcısının site paneli yok; kendi ekranı
  // platform yönetimi. Bir sitenin paneline hesaba geçişle giriliyor.
  if (isPlatformContext(ctx)) redirect("/yonetim");
  const cookieStore = await cookies();

  // Menü hem izne hem kitleye bakar: sakinin `announcement:read` izni var ama
  // yönetim ekranları onun menüsünde işi yok (bkz. `navItemsFor`).
  const allowedHrefs = navItemsFor(ctx.roles).map((i) => i.href);

  // Rozetler ve bildirimler paralel çekilir: kabuk her sayfada render edildiği
  // için sıralı beklemek tüm panele gecikme bindirirdi.
  //
  // Rozet sayaçları yönetim sorguları (açık talep, eşleşmemiş banka hareketi);
  // sakinde ne izni ne anlamı var, bu yüzden hiç çağrılmıyor.
  const isResident = audienceOf(ctx.roles) === "resident";
  const [badges, notifications] = await Promise.all([
    isResident
      ? Promise.resolve({} as Awaited<ReturnType<typeof getNavBadges>>)
      : getNavBadges(),
    getInAppNotifications(),
  ]);

  return (
    <AppShell
      tenantId={ctx.tenantId}
      tenantName={ctx.tenantName}
      tenantStatus={ctx.tenantStatus}
      memberships={ctx.memberships}
      userName={ctx.userName}
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
      {modal}
    </AppShell>
  );
}
