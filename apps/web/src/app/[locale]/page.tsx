import Image from "next/image";
import { ArrowRight, Building2, Building as Buildings, ChevronRight } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { type Locale } from "@yonetim/i18n";
import { STANDARD_PLANS } from "@yonetim/pricing";
import { faqSchema, jsonLdScript, softwareApplicationSchema } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { Reveal } from "@yonetim/ui/motion";

import { Link } from "@/i18n/navigation";
import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";
import { MODULE_KEYS } from "@/components/module-list";
import { ResidentDemo } from "@/components/home/resident-demo";
import { HeroFigure } from "@/components/home/hero-figure";
import { PricingPreview } from "@/components/home/pricing-preview";
import { getPathname } from "@/i18n/navigation";

/** JSON-LD `featureList` anahtarları — metinler `marketing.home.schemaFeature.*`. */
const SCHEMA_FEATURES = [
  "dues", "payment", "bot", "expense", "maintenance", "meeting", "kvkk", "legal",
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.home");
  const tCommon = await getTranslations("common");
  const tModule = await getTranslations("marketing.module");
  const content = getContent(locale);

  const cheapest = STANDARD_PLANS[0]!;
    const pricingHref = getPathname({ href: "/fiyatlandirma", locale: locale as Locale });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            softwareApplicationSchema({
              lowestPriceTl: cheapest.yearlyPriceTl,
              description: tCommon("brand.description"),
              featureList: SCHEMA_FEATURES.map((key) => t(`schemaFeature.${key}`)),
              locale: locale as Locale,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(content.faqs.slice(0, 3))) }}
      />

      {/*
        HERO — iki sütun, ortalanmış değil.

        NEDEN ORTALANMIŞ DEĞİL: Ortalanmış başlık + rozet + iki buton + altında
        arayüz mock'u, bugün her SaaS açılış sayfasının aynı dizilişi. Aynı
        bilgiyi asimetrik yerleştirmek hem daha az yer kaplıyor hem de sağdaki
        görsele "ilk ekranda" yer açıyor — sektörün (ve müşterinin karşılaştırdığı
        rakiplerin) yaptığı da bu.

        LCP öğesi `h1`; sunucuda render edilir, hidrasyonu beklemez. Hareket
        yalnız sağdaki görselin üstündeki rozetlerde.
      */}
      <section className="home-hero relative isolate">

        {/* `relative`: konumlandırılmış dekor, konumlandırılmamış içeriğin
            üstüne boyanır — ızgara çizgileri başlığın üstünden geçiyordu. */}
        <Image src="/images/olive-canopy.png" alt="" width={1774} height={887} className="home-canopy" />
        <div className="marketing-container relative pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,6.5fr)_minmax(0,5fr)] lg:gap-12">
            <div>
              <h1 className="font-heading text-4xl font-extrabold leading-[1.06] tracking-tight text-fg sm:text-5xl xl:text-6xl">
                {t("heroTitle")} <em className="hero-accent">{t("heroTitleAccent")}</em>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                {t.rich("heroSubtitle", richTags)}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <a
                  href={`${siteConfig.env.appUrl}/kayit`}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-fg shadow-md transition-all duration-150 hover:bg-primary-hover hover:shadow-lg active:scale-[0.98]"
                >
                  {t("ctaPrimary")}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </a>
                <Link
                  href="/ozellikler"
                  className="inline-flex items-center rounded-xl border border-border-strong bg-surface px-6 py-3.5 font-semibold text-fg shadow-sm transition-all duration-150 hover:border-fg/50 hover:bg-hover active:scale-[0.98]"
                >
                  {t("heroDiscover")}
                </Link>
              </div>

              {/* Deneme koşulu artık kararın yanında: buton, sonra koşul. */}
              <p className="mt-4 max-w-md text-sm text-fg-subtle">{t("ctaNote")}</p>


            </div>

            <Reveal direction="left" delay={0.08}>
              <HeroFigure
                labels={{
                  alt: t("heroImageAlt"),
                  overlay: t("heroOverlay"),
                  collectionRate: t("mock.collectionRate"),
                  trend: t("mock.trend"),
                  chatPrompt: t("mock.chatPrompt"),
                  chatReply: t("mock.chatReply"),
                }}
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="marketing-container home-panel-section" aria-label={t("actualPanelLabel")}>
        <figure className="home-panel-frame">
          <figcaption>{t("actualPanelCaption")}</figcaption>
          <div className="home-panel-image"><Image src="/images/panel-retouched.png" alt={t("actualPanelAlt")} width={1507} height={1044} unoptimized sizes="(min-width: 1440px) 1376px, 96vw" /></div>
        </figure>
      </section>

      <section className="marketing-container home-audiences">
        {[{icon: Building2, title: "managerTitle", body: "managerBody", label: "managerLabel"}, {icon: Buildings, title: "companyTitle", body: "companyBody", label: "companyLabel"}].map(({icon: Icon, title, body, label}) => (
          <article key={title}>
            <Icon aria-hidden className="h-10 w-10 text-primary" strokeWidth={1.2} />
            <div><p className="text-xs text-fg-muted">{t(label)}</p><h2>{t(title)}</h2><p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(body)}</p><Link href="/ozellikler" className="home-text-link">{t("featureDetail")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
          </article>
        ))}
      </section>

      <section className="home-modules border-y border-border">
        <div className="marketing-container home-section">
          <div className="home-section-heading"><h2>{t("unifiedTitle")}</h2><p>{t("unifiedBody")}</p></div>
          <div className="home-module-list">
            {MODULE_KEYS.map((key, index) => <Link key={key} href={{pathname:"/ozellikler",hash:`module-${key}`}} className="home-module-item"><span aria-hidden className="text-primary text-lg">{String(index + 1).padStart(2,"0")}</span><h3>{tModule(`${key}Title`)}</h3><p>{t(`moduleSummary.${key}`)}</p><ArrowRight aria-hidden className="h-4 w-4 text-primary" /></Link>)}
          </div>
          <Link href="/ozellikler" className="home-text-link">{t("allFeaturesLink")}<ArrowRight aria-hidden className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="home-whatsapp bg-ink text-ink-fg">
        <div className="marketing-container home-section home-whatsapp-grid">
          <div><h2>{t("whatsappTitle")}</h2><p className="mt-4 text-sm leading-relaxed text-ink-muted-fg">{t("whatsappBody")}</p><Link href={{pathname:"/ozellikler",hash:"module-communication"}} className="mt-5 inline-flex items-center gap-2 text-sm text-ink-fg underline underline-offset-4">{t("whatsappLink")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
          <div className="home-chat-example"><p className="mb-3 text-xs text-ink-muted-fg">{t("chatExample")}</p><ResidentDemo labels={{chatPrompt:t("mock.chatPrompt"),chatReply:t("mock.chatReply")}} /></div>
          <ol className="space-y-6">{["ask","see","pay"].map((key,index) => <li key={key} className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-fg text-sm">{index+1}</span><div><h3 className="font-semibold text-sm">{t(`chatSteps.${key}.title`)}</h3><p className="mt-1 text-sm leading-relaxed text-ink-muted-fg">{t(`chatSteps.${key}.body`)}</p></div></li>)}</ol>
        </div>
      </section>

      <section className="marketing-container home-section home-portfolio">
        <div><h2>{t("portfolioTitle")}</h2><p className="mt-4 text-sm leading-relaxed text-fg-muted">{t("portfolioBody")}</p><Link href="/ozellikler" className="home-text-link">{t("featureDetail")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
        <div className="home-portfolio-example"><p className="mb-3 text-xs text-fg-subtle">{t("portfolioExample")}</p>{["Örnek Apartmanı","Park Sitesi","Mavi Konutları","Doğa Sitesi"].map((name,index) => <div key={name} className="flex items-center gap-3 border-t border-border py-3"><Image src={index%2 ? "/images/shared-space.webp" : "/images/courtyard.webp"} alt="" width={44} height={44} className="h-11 w-11 object-cover" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{name}</p><p className="mt-0.5 text-xs text-fg-muted">{[24,96,48,120][index]} {t("portfolioUnits")}</p></div><ChevronRight aria-hidden className="h-4 w-4 text-fg-subtle" /></div>)}</div>
        <Image src="/images/shared-space.webp" alt={t("residentImageAlt")} width={1536} height={1024} sizes="(min-width: 1024px) 30vw, 100vw" className="home-portfolio-photo" />
      </section>

      <section className="bg-surface-sunken border-y border-border">
        <div className="marketing-container home-section home-pricing-band"><div><h2>{t("compactPricingTitle")}</h2><p className="mt-3 text-sm text-fg-muted">{t("modulesSubtitle")}</p></div><PricingPreview locale={locale} signupUrl={`${siteConfig.env.appUrl}/kayit`} pricingHref={pricingHref} labels={{units:t("pricingUnits"),plan:t("pricingPlan"),monthly:t("pricingMonthly"),yearly:t("pricingYearly"),yearlyBadge:t("pricingYearlyBadge"),perUnit:t("pricingPerUnit"),cta:t("pricingCta"),all:t("pricingAll"),savings:t("savingsBadge",{pct:"{pct}"}),periodLabel:t("periodLabel")}} /></div>
      </section>

      <section className="marketing-container home-section home-migration">
        <div><h2>{t("compactMigrationTitle")}</h2><p className="mt-3 text-sm text-fg-muted">{t("compactMigrationBody")}</p><Link href="/gecis" className="home-text-link">{t("ctaSecondaryLink")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
        <ol>{["source","match","balance","start"].map((key,index) => <li key={key}><span className="home-step-number">{index+1}</span><h3 className="mt-3 text-sm font-semibold">{t(`migrationSteps.${key}.title`)}</h3><p className="mt-2 text-xs leading-relaxed text-fg-muted">{t(`migrationSteps.${key}.body`)}</p></li>)}</ol>
      </section>

      <section className="marketing-container home-section home-knowledge border-t border-border">
        <div><h2>{t("notesTitle")}</h2><p className="mt-3 text-sm leading-relaxed text-fg-muted">{t("notesBody")}</p><Link href="/blog" className="home-text-link">{t("notesLink")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
        <div className="home-posts">{content.posts.slice(0,2).map((post,index) => <Link key={post.slug} href={{pathname:"/blog/[slug]",params:{slug:post.slug}}} className="home-post"><Image src={index ? "/images/shared-space.webp" : "/images/courtyard.webp"} alt="" width={96} height={76} className="h-19 w-24 object-cover" /><div><h3 className="text-sm font-semibold leading-snug">{post.title}</h3><span className="mt-2 inline-block text-xs text-primary">{t("notesRead")} →</span></div></Link>)}</div>
        <div><h3 className="mb-3 text-sm font-semibold">{t("faqTitle")}</h3><Accordion>{content.faqs.slice(0,3).map(faq => <AccordionItem key={faq.question} title={faq.question} name="home-faq">{faq.answer}</AccordionItem>)}</Accordion><Link href="/sss" className="home-text-link">{t("faqAll")}<ArrowRight aria-hidden className="h-4 w-4" /></Link></div>
      </section>

      <section className="bg-ink text-ink-fg"><div className="marketing-container home-section home-closing"><div><h2>{t("compactCtaTitle")}</h2><p className="mt-2 text-sm text-ink-muted-fg">{t("ctaNote")}</p></div><a href={`${siteConfig.env.appUrl}/kayit`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover">{t("ctaPrimary")}<ArrowRight aria-hidden className="h-4 w-4" /></a></div></section>
    </>
  );
}
