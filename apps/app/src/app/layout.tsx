import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";

import { siteConfig } from "@yonetim/config";
import { getNamespaces, LOCALE_META, type Locale } from "@yonetim/i18n";
import {
  a11yInitScript, parseThemePreference, serverThemeAttribute, themeInitScript, THEME_COOKIE,
} from "@yonetim/ui";

import { CLIENT_NAMESPACES } from "@/i18n/client-namespaces";

import "./globals.css";

const body = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-body-src", display: "swap" });
const heading = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading-src",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: { default: `${siteConfig.brand.name}`, template: `%s · ${siteConfig.brand.name}` },
    description: t("nav.dashboard"),
    // Uygulama sayfaları kullanıcıya özeldir — dizinlenmez (Bölüm 10.1).
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: siteConfig.design.colors.background },
    { media: "(prefers-color-scheme: dark)", color: siteConfig.design.colors.backgroundDark },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const meta = LOCALE_META[locale as Locale] ?? LOCALE_META.tr;
  // İstemci bileşenlerinin ihtiyaç duyduğu namespace'ler (bkz. client-namespaces).
  const clientMessages = getNamespaces(locale, CLIENT_NAMESPACES);

  const cookieStore = await cookies();
  const themePreference = parseThemePreference(cookieStore.get(THEME_COOKIE)?.value);
  const themeAttribute = serverThemeAttribute(themePreference);
  const c = siteConfig.design.colors;

  return (
    <html
      lang={meta.htmlLang}
      dir={meta.direction}
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
        {/* Yazı ölçeği / karşıtlık tercihi — aynı gerekçe, aynı an. */}
        <script dangerouslySetInnerHTML={{ __html: a11yInitScript }} />
      </head>
      <body className="min-h-dvh bg-canvas font-sans text-fg antialiased">
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
