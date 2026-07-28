import { ArrowRight, Home } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/**
 * 404 — daha önce hiç yoktu, ziyaretçi Next'in çerçevesiz varsayılan
 * sayfasıyla karşılaşıyordu.
 *
 * Ölü bir bağlantı bir çıkmaz değil, bir yönlendirme fırsatı: en çok aranan
 * dört sayfaya buradan geçiliyor.
 */
export default async function NotFound() {
  const t = await getTranslations("marketing.notFound");
  const tNav = await getTranslations("marketing.nav");

  const suggestions = [
    { href: "/ozellikler", label: tNav("features") },
    { href: "/fiyatlandirma", label: tNav("pricing") },
    { href: "/blog", label: tNav("blog") },
    { href: "/sss", label: tNav("faq") },
  ] as const;

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p className="font-heading text-7xl font-extrabold tracking-tight text-primary-soft-fg">404</p>
      <h1 className="mt-6 font-heading text-3xl font-extrabold text-fg">{t("title")}</h1>
      <p className="mt-3 text-fg-muted">{t("body")}</p>

      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
      >
        <Home aria-hidden className="h-4 w-4" />
        {t("home")}
      </Link>

      <div className="mt-10 w-full border-t border-border pt-8">
        <h2 className="text-sm font-semibold text-fg-muted">{t("suggestions")}</h2>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
              >
                {item.label}
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
