import { ArrowRight, Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { Reveal } from "@yonetim/ui/motion";

import { Link } from "@/i18n/navigation";
import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.faq" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/sss", locale as Locale),
    alternatePaths: alternatePaths("/sss"),
  });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.faq");
  const content = getContent(locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(content.faqs)) }}
      />



      {/*
        Akordiyon `<details>` üzerine kurulu: cevaplar DOM'da duruyor, yapısal
        veriyle (`FAQPage`) birebir aynı metin. Tarayıcının "sayfada bul"
        özelliği kapalı cevabı bulunca açıyor — elle yazılmış bir akordiyonda
        bu davranış kaybolurdu.
      */}
      <section className="marketing-container faq-layout grid gap-12 py-14 lg:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)]">
        <div className="faq-primary">
        <header className="faq-heading">
          <h1>{t("title").split(" ").slice(0,-1).join(" ")} <em>{t("title").split(" ").slice(-1)}</em></h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">{t("subtitle")}</p>
        </header>
        <Accordion>
          {content.faqs.map((faq, index) => (
            <AccordionItem key={faq.question} title={faq.question} defaultOpen={index === 0} indicator="plus">
              {faq.answer}
            </AccordionItem>
          ))}
        </Accordion>
        </div>

        <Reveal className="faq-support h-fit border-t border-border pt-8 lg:sticky lg:top-28 lg:border-l lg:border-t-0 lg:ps-10 lg:pt-0">
          <h2 className="font-heading text-xl font-bold text-fg">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{t("ctaBody")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${siteConfig.brand.contact.email}`}
              className="inline-flex items-center gap-2 border-b border-primary py-2 text-sm font-semibold text-primary hover:text-fg"
            >
              <Mail aria-hidden className="h-4 w-4" />
              {siteConfig.brand.contact.email}
            </a>
            <Link
              href="/ozellikler"
              className="inline-flex items-center gap-1.5 py-2 text-sm font-semibold text-primary hover:underline"
            >
              {t("ctaLink")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
          <nav className="mt-10 border-t border-border pt-6" aria-label={locale === "tr" ? "İlgili sayfalar" : "Related pages"}>
            {(["/ozellikler", "/fiyatlandirma", "/kampanyalar", "/gecis", "/blog"] as const).map((href, index) => <Link key={href} href={href} className="flex items-center justify-between border-b border-border py-4 text-lg text-fg hover:text-primary">{(locale === "tr" ? ["Özellikler", "Fiyatlandırma", "Kampanyalar", "Geçiş", "Blog"] : ["Features", "Pricing", "Offers", "Switching", "Blog"])[index]}<ArrowRight aria-hidden className="h-4 w-4 text-primary" /></Link>)}
          </nav>
        </Reveal>
      </section>
    </>
  );
}
