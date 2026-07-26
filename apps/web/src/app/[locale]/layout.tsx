import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";

import { siteConfig } from "@yonetim/config";
import {
  getNamespaces, isLocale, LOCALES, LOCALE_META, type Locale,
} from "@yonetim/i18n";
import { jsonLdScript, organizationSchema } from "@yonetim/seo";
import {
  parseThemePreference, serverThemeAttribute, themeInitScript, THEME_COOKIE,
} from "@yonetim/ui";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CLIENT_NAMESPACES } from "@/i18n/client-namespaces";
import { hreflangEntries, localizedPath } from "@/lib/paths";

const body = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-body-src", display: "swap" });
const heading = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading-src",
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: siteConfig.design.colors.background },
    { media: "(prefers-color-scheme: dark)", color: siteConfig.design.colors.backgroundDark },
  ],
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });

  return {
    metadataBase: new URL(siteConfig.env.baseUrl),
    title: {
      default: `${siteConfig.brand.name} — ${t("brand.tagline")}`,
      template: `%s | ${siteConfig.brand.name}`,
    },
    description: t("brand.description"),
    applicationName: siteConfig.brand.name,
    alternates: {
      canonical: `${siteConfig.env.baseUrl}${localizedPath("/", locale as Locale)}`,
      languages: hreflangEntries("/"),
    },
    openGraph: {
      type: "website",
      locale: (LOCALE_META[locale as Locale] ?? LOCALE_META.tr).htmlLang.replace("-", "_"),
      siteName: siteConfig.brand.name,
      url: siteConfig.env.baseUrl,
    },
    robots: { index: true, follow: true },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Statik render için locale'i istek bağlamına yaz (next-intl gereksinimi).
  setRequestLocale(locale);

  const meta = LOCALE_META[locale];
  // İstemci bileşenlerinin ihtiyaç duyduğu namespace'ler (bkz. client-namespaces).
  const clientMessages = getNamespaces(locale, CLIENT_NAMESPACES);
  const cookieStore = await cookies();
  const themePreference = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const themeAttribute = serverThemeAttribute(themePreference);
  const t = await getTranslations({ locale, namespace: "common" });
  const c = siteConfig.design.colors;

  return (
    <html
      lang={meta.htmlLang}
      dir={meta.direction}
      // Tema niteliği paint öncesi betikle yazılır; React'in uyarmasını engelle.
      suppressHydrationWarning
      data-theme={themeAttribute}
      data-theme-preference={themePreference}
      className={`${body.variable} ${heading.variable}`}
    >
      <head>
        <style>{`:root{
          --brand-primary:${c.primary};
          --brand-secondary:${c.secondary};
          --brand-accent:${c.accent};
          --font-body:var(--font-body-src);
          --font-heading:var(--font-heading-src);
        }`}</style>
        {/* Tema atlamasını (FOUC) engeller: stil sonrası, gövde öncesi çalışır. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              organizationSchema({ description: t("brand.description"), locale }),
            ),
          }}
        />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <a
            href="#icerik"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
          >
            {t("a11y.skipToContent")}
          </a>
          <SiteHeader themePreference={themePreference} />
          <main id="icerik">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
