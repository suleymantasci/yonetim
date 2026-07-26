import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { ThemeToggle, type ThemePreference } from "@yonetim/ui";

import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";

const NAV = [
  { href: "/ozellikler", key: "features" },
  { href: "/fiyatlandirma", key: "pricing" },
  { href: "/kampanyalar", key: "campaigns" },
  { href: "/gecis", key: "migration" },
  { href: "/blog", key: "blog" },
  { href: "/sss", key: "faq" },
] as const;

export async function SiteHeader({ themePreference }: { themePreference: ThemePreference }) {
  const t = await getTranslations("marketing.nav");
  const tCommon = await getTranslations("common");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg">
            {siteConfig.brand.shortName.charAt(0)}
          </span>
          {siteConfig.brand.name}
        </Link>

        <nav aria-label={tCommon("a11y.mainMenu")} className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-fg-muted transition-colors hover:text-primary"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
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
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-hover hover:text-fg md:block"
          >
            {t("signIn")}
          </a>
          <a
            href={`${siteConfig.env.appUrl}/kayit`}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
          >
            {t("startFree")}
          </a>
        </div>
      </div>
    </header>
  );
}
