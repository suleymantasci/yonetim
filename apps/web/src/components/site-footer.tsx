import { Mail, Phone, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { BrandLockup } from "@yonetim/ui";

import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Rehber bağlantıları şablonlu bir yol (`/rehber/[slug]`) kullanıyor; next-intl
 * bu durumda `href`i nesne biçiminde ister. Önceden burada `@ts-expect-error`
 * vardı — tip hatası bastırılıyordu, çözülmüyordu. Ayrık birlik (discriminated
 * union) ile artık slug'ın varlığı tipten okunuyor.
 */
type FooterLink =
  | { key: string; href: "/ozellikler" | "/fiyatlandirma" | "/kampanyalar" | "/gecis" | "/blog" | "/sss" | "/kvkk" }
  | { key: string; guide: string };

const COLUMNS: ReadonlyArray<{ titleKey: string; links: readonly FooterLink[] }> = [
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
      { guide: "apartman-aidat-zammi-nasil-hesaplanir", key: "duesGuideLink" },
      { guide: "isletme-projesi-nasil-hazirlanir", key: "meetingGuideLink" },
      { href: "/sss", key: "faqLink" },
    ],
  },
  {
    titleKey: "corporate",
    links: [{ href: "/kvkk", key: "kvkkLink" }],
  },
];

const LINK_CLASS = "text-sm text-fg-muted transition-colors hover:text-fg";

export async function SiteFooter() {
  const t = await getTranslations("marketing.footer");
  const tCommon = await getTranslations("common");

  return (
    <footer className="border-t border-border bg-surface-sunken">
      <div className="marketing-container grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:pe-8">
          <BrandLockup />
          <p className="mt-3 max-w-xs text-sm text-fg-muted">{tCommon("brand.tagline")}</p>

          <ul className="mt-5 space-y-2 text-sm text-fg-subtle">
            <li className="flex items-center gap-2">
              <Mail aria-hidden className="h-4 w-4 shrink-0" />
              <a href={`mailto:${siteConfig.brand.contact.email}`} className={LINK_CLASS}>
                {siteConfig.brand.contact.email}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone aria-hidden className="h-4 w-4 shrink-0" />
              <a
                href={`tel:${siteConfig.brand.contact.phone.replace(/\s/g, "")}`}
                className={LINK_CLASS}
              >
                {siteConfig.brand.contact.phone}
              </a>
            </li>
          </ul>

          <LocaleSwitcher className="mt-5" />
        </div>

        {COLUMNS.map((column) => (
          <div key={column.titleKey}>
            <h2 className="text-sm font-semibold text-fg">{t(column.titleKey)}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.key}>
                  {"guide" in link ? (
                    <Link
                      href={{ pathname: "/rehber/[slug]", params: { slug: link.guide } }}
                      className={LINK_CLASS}
                    >
                      {t(link.key)}
                    </Link>
                  ) : (
                    <Link href={link.href} className={LINK_CLASS}>
                      {t(link.key)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="marketing-container flex flex-col items-center justify-between gap-3 py-5 text-xs text-fg-subtle sm:flex-row">
          <p>
            © {new Date().getFullYear()} {siteConfig.brand.legalName}.{" "}
            {tCommon("legal.allRightsReserved")}
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="h-4 w-4" />
            {tCommon("legal.complianceNote")}
          </p>
        </div>
      </div>
    </footer>
  );
}
