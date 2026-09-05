import { ArrowRight, Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { faqSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { BlueprintGrid, BrandWash, Reveal } from "@yonetim/ui/motion";

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

      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />
        <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-16 text-center">
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-fg-muted">
            {t("subtitle")}
          </p>
        </div>
      </section>

      {/*
        Akordiyon `<details>` üzerine kurulu: cevaplar DOM'da duruyor, yapısal
        veriyle (`FAQPage`) birebir aynı metin. Tarayıcının "sayfada bul"
        özelliği kapalı cevabı bulunca açıyor — elle yazılmış bir akordiyonda
        bu davranış kaybolurdu.
      */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <Accordion>
          {content.faqs.map((faq) => (
            <AccordionItem key={faq.question} title={faq.question}>
              {faq.answer}
            </AccordionItem>
          ))}
        </Accordion>

        <Reveal className="mt-12 rounded-2xl border border-border bg-surface-sunken p-6 text-center sm:p-8">
          <h2 className="font-heading text-xl font-bold text-fg">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">{t("ctaBody")}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`mailto:${siteConfig.brand.contact.email}`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-all duration-150 hover:bg-primary-hover hover:shadow active:scale-[0.98]"
            >
              <Mail aria-hidden className="h-4 w-4" />
              {siteConfig.brand.contact.email}
            </a>
            <Link
              href="/ozellikler"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong px-5 py-3 text-sm font-semibold text-fg shadow-sm transition-all duration-150 hover:border-fg/50 hover:bg-hover active:scale-[0.98]"
            >
              {t("ctaLink")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
