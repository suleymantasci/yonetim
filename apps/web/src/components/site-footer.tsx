import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";

import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";

const COLUMNS = [
  {
    titleKey: "product",
    links: [
      { href: "/ozellikler", key: "featuresLink" },
      { href: "/fiyatlandirma", key: "pricingLink" },
      { href: "/kampanyalar", key: "campaignsLink" },
      { href: "/gecis", key: "migrationLink" },
    ],
  },
  {
    titleKey: "resources",
    links: [
      { href: "/blog", key: "blogLink" },
      { href: "/rehber/apartman-aidat-zammi-nasil-hesaplanir", key: "duesGuideLink" },
      { href: "/rehber/isletme-projesi-nasil-hazirlanir", key: "meetingGuideLink" },
      { href: "/sss", key: "faqLink" },
    ],
  },
  {
    titleKey: "corporate",
    links: [{ href: "/kvkk", key: "kvkkLink" }],
  },
] as const;

export async function SiteFooter() {
  const t = await getTranslations("marketing.footer");
  const tCommon = await getTranslations("common");

  return (
    <footer className="border-t border-border bg-surface-sunken">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <div className="font-heading text-lg font-extrabold">{siteConfig.brand.name}</div>
          <p className="mt-2 max-w-xs text-sm text-fg-muted">{tCommon("brand.tagline")}</p>
          <p className="mt-4 text-sm text-fg-subtle">
            {siteConfig.brand.contact.email}
            <br />
            {siteConfig.brand.contact.phone}
          </p>
          <LocaleSwitcher className="mt-4" />
        </div>

        {COLUMNS.map((col) => (
          <div key={col.titleKey}>
            <h2 className="text-sm font-semibold text-fg">{t(col.titleKey)}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    // @ts-expect-error — rehber slug'ları çalışma zamanında üretilir.
                    href={l.href}
                    className="text-sm text-fg-muted transition-colors hover:text-primary"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-4 py-4 text-center text-xs text-fg-subtle">
        © {new Date().getFullYear()} {siteConfig.brand.legalName}. {tCommon("legal.allRightsReserved")}
        {" · "}
        {tCommon("legal.complianceNote")}
      </div>
    </footer>
  );
}
