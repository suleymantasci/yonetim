import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { BrandLockup, ThemeToggle, type ThemePreference } from "@yonetim/ui";

import { Link } from "@/i18n/navigation";
import { HeaderChrome } from "@/components/header-chrome";
import { LocaleSwitcher } from "@/components/locale-switcher";

const NAV = [
  { href: "/ozellikler", key: "features" },
  { href: "/fiyatlandirma", key: "pricing" },
  { href: "/kampanyalar", key: "campaigns" },
  { href: "/gecis", key: "migration" },
  { href: "/blog", key: "blog" },
  { href: "/sss", key: "faq" },
] as const;

/**
 * Site başlığı — sunucu bileşeni.
 *
 * Etkileşim (mobil menü, kaydırma durumu) `HeaderChrome` içinde; bağlantılar
 * ve etiketler burada, sunucuda üretilip oraya `children` olarak geçiyor.
 * Bu ayrım sayesinde pazarlama çeviri paketi istemciye hiç gitmiyor.
 */
export async function SiteHeader({ themePreference }: { themePreference: ThemePreference }) {
  const t = await getTranslations("marketing.nav");
  const tCommon = await getTranslations("common");

  const navLinks = NAV.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg"
    >
      {t(item.key)}
    </Link>
  ));

  const actions = (
    <>
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
      <a
        href={`${siteConfig.env.appUrl}/giris`}
        className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg xl:block"
      >
        {t("signIn")}
      </a>
      <a
        href={`${siteConfig.env.appUrl}/kayit`}
        className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover sm:inline-flex"
      >
        {t("startFree")}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </a>
    </>
  );

  const mobilePanel = (
    <nav aria-label={tCommon("a11y.mainMenu")} className="flex flex-col gap-1 p-4">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg px-3 py-3 text-base font-medium text-fg transition-colors hover:bg-hover"
        >
          {t(item.key)}
        </Link>
      ))}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        <a
          href={`${siteConfig.env.appUrl}/kayit`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-fg"
        >
          {t("startFree")}
          <ArrowRight aria-hidden className="h-4 w-4" />
        </a>
        <a
          href={`${siteConfig.env.appUrl}/giris`}
          className="inline-flex items-center justify-center rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-fg"
        >
          {t("signIn")}
        </a>
        <LocaleSwitcher className="mt-2 self-start sm:hidden" />
      </div>
    </nav>
  );

  return (
    <HeaderChrome
      brand={
        <Link href="/" className="rounded-lg" aria-label={siteConfig.brand.name}>
          <BrandLockup />
        </Link>
      }
      nav={navLinks}
      actions={actions}
      mobilePanel={mobilePanel}
      labels={{ menu: tCommon("a11y.mainMenu"), close: tCommon("action.close") }}
    />
  );
}
