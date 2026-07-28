import { ArrowRight, BadgeCheck, Check, Download, MessageSquare, Scale, ShieldCheck, Smartphone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { formatAmount, type Locale } from "@yonetim/i18n";
import { STANDARD_PLANS, savingsVsCompetitorPct } from "@yonetim/pricing";
import { faqSchema, jsonLdScript, softwareApplicationSchema } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { BlueprintGrid, BrandWash, Reveal, Stagger } from "@yonetim/ui/motion";

import { Link } from "@/i18n/navigation";
import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";
import { MODULE_KEYS } from "@/components/module-list";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import { HeroFigure } from "@/components/home/hero-figure";
import { Ledger } from "@/components/home/ledger";
import { PricingPreview } from "@/components/home/pricing-preview";
import { ProductMock } from "@/components/home/product-mock";
import { StoryRow } from "@/components/home/story-row";
import { getPathname } from "@/i18n/navigation";

/** JSON-LD `featureList` anahtarları — metinler `marketing.home.schemaFeature.*`. */
const SCHEMA_FEATURES = [
  "dues", "payment", "bot", "expense", "maintenance", "meeting", "kvkk", "legal",
] as const;

/**
 * Güven şeridi — **doğrulanabilir** unsurlar.
 *
 * Müşteri logosu ya da "500+ site bize güveniyor" gibi bir sayı burada yok:
 * ikisi de gerçek veri ister ve `content.customers` boş olduğu sürece o bölüm
 * hiç render edilmiyor. Buradakiler ürünün fiilen sahip olduğu uyum ve
 * entegrasyon nitelikleri.
 */
const TRUST = [
  { key: "trustKvkk", icon: ShieldCheck },
  { key: "trustKmk", icon: Scale },
  { key: "trust3d", icon: BadgeCheck },
  { key: "trustWhatsapp", icon: MessageSquare },
  { key: "trustSms", icon: Smartphone },
  { key: "trustExport", icon: Download },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.home");
  const tCommon = await getTranslations("common");
  const tModule = await getTranslations("marketing.module");
  const content = getContent(locale);

  const cheapest = STANDARD_PLANS[0]!;
  const savings = savingsVsCompetitorPct(cheapest) ?? 50;
  const pricingHref = getPathname({ href: "/fiyatlandirma", locale: locale as Locale });
  const featuresHref = getPathname({ href: "/ozellikler", locale: locale as Locale });

  /** Hero'nun altındaki rakam şeridi — üçü de üründen doğrulanabilir. */
  const heroStats = [
    { value: t("heroStat1Value", { savings }), label: t("heroStat1Label", { price: formatAmount(cheapest.yearlyPriceTl, locale) }) },
    { value: t("heroStat2Value"), label: t("heroStat2Label") },
    { value: t("heroStat3Value"), label: t("heroStat3Label") },
  ];

  const ledgerBefore = t("ledgerBefore").split("|");
  const ledgerRows = t("ledgerAfter")
    .split("|")
    .map((after, index) => ({ before: ledgerBefore[index] ?? "", after }));

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
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqSchema(content.faqs.slice(0, 6))) }}
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
      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid />

        {/* `relative`: konumlandırılmış dekor, konumlandırılmamış içeriğin
            üstüne boyanır — ızgara çizgileri başlığın üstünden geçiyordu. */}
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,6.5fr)_minmax(0,5fr)] lg:gap-12">
            <div>
              {/*
                Eski hâlinde burada nabız gibi atan yeşil noktalı bir hap vardı
                ("30 gün ücretsiz · kredi kartı istemiyoruz"). O bileşen üretilmiş
                her açılış sayfasında aynı biçimde duruyor ve iki şeyi birden
                yanlış yapıyordu: yanıp sönen nokta "canlı veri" işaretidir, oysa
                orada sabit bir pazarlama cümlesi vardı; deneme koşulu da karar
                anına (butonun altına) değil sayfanın en tepesine konmuştu.

                Yerine geçen şey bir rozet değil, bir **künye**: ürünün hangi
                mevzuata göre kurgulandığını söylüyor. Bu cümleyi yazabilmek için
                ürünü bilmek gerekir — jenerik bir şablondan çıkmaz.
              */}
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
                <span aria-hidden className="h-px w-8 shrink-0 bg-primary" />
                {t("heroEyebrow")}
              </p>

              <h1 className="mt-5 max-w-[17ch] font-heading text-4xl font-extrabold leading-[1.06] tracking-tight text-fg sm:text-5xl xl:text-6xl">
                {t("heroTitle")} <span className="text-primary">{t("heroTitleAccent")}</span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                {t.rich("heroSubtitle", richTags)}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={`${siteConfig.env.appUrl}/kayit`}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-fg shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover hover:shadow-xl hover:shadow-primary/25"
                >
                  {t("ctaPrimary")}
                  <ArrowRight aria-hidden className="h-4 w-4" />
                </a>
                <Link
                  href="/fiyatlandirma"
                  className="inline-flex items-center rounded-xl border border-border-strong bg-surface/70 px-6 py-3.5 font-semibold text-fg backdrop-blur transition-colors hover:bg-hover"
                >
                  {t("ctaSecondary")}
                </Link>
              </div>

              {/* Deneme koşulu artık kararın yanında: buton, sonra koşul. */}
              <p className="mt-4 text-sm text-fg-subtle">{t("ctaNote")}</p>

              <ul className="mt-9 grid gap-5 border-t border-border pt-6 sm:grid-cols-3">
                {heroStats.map((stat) => (
                  <li key={stat.value}>
                    <p className="font-heading text-lg font-bold tracking-tight text-fg">{stat.value}</p>
                    <p className="mt-1 text-sm leading-snug text-fg-muted">{stat.label}</p>
                  </li>
                ))}
              </ul>
            </div>

            <Reveal direction="left" delay={0.08}>
              <HeroFigure
                labels={{
                  alt: t("heroImageAlt"),
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

      {/*
        UYUM ŞERİDİ — künye bandı.

        Aralarında boşluk bırakılmış ikon dizisi yerine hücreli bir şerit:
        `gap-px` + zemin rengi, her hücrenin arasına saç teli çizgi koyuyor.
        Ayraç `border-s` ile değil bu yolla çiziliyor çünkü kırılma noktası
        başına ilk/son hücre istisnası yazmak gerekmiyor.
      */}
      <section className="border-b border-border" aria-label={t("trustTitle")}>
        <ul className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {TRUST.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex items-center gap-2 bg-surface-sunken px-4 py-4 text-xs font-medium text-fg-muted"
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* DEFTER — "bugün elle nasıl yürüyor" ↔ "panelde nereye düşüyor" */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("ledgerTitle")}
          </h2>
          <p className="mt-3 text-fg-muted">{t("ledgerSubtitle")}</p>
        </Reveal>

        <Reveal className="mt-10">
          <Ledger
            beforeLabel={t("ledgerBeforeLabel")}
            afterLabel={t("ledgerAfterLabel")}
            rows={ledgerRows}
          />
        </Reveal>
      </section>

      {/*
        PANEL — arayüz gösterimi, yanında ne gösterdiğini anlatan metin.

        Mock hero'dan buraya taşındı: hero'da ürün ekranı göstermek yaygın ama
        ilk ekranda ziyaretçinin bilmediği bir arayüzü açıklamasız göstermek
        demek. Burada solda ne bakacağı yazıyor.
      */}
      <section className="border-y border-border bg-surface-sunken py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t("panelEyebrow")}
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("panelTitle")}
            </h2>
            <p className="mt-4 leading-relaxed text-fg-muted">{t("panelBody")}</p>
            <ul className="mt-6 space-y-2.5">
              {t("panelPoints")
                .split("|")
                .map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm text-fg">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{point}</span>
                  </li>
                ))}
            </ul>
          </Reveal>

          <Reveal direction="left" delay={0.08}>
            <ProductMock
              locale={locale}
              labels={{
                caption: t("mock.caption"),
                collectionRate: t("mock.collectionRate"),
                collected: t("mock.collected"),
                openRequests: t("mock.openRequests"),
                trend: t("mock.trend"),
                chatPrompt: t("mock.chatPrompt"),
                chatReply: t("mock.chatReply"),
                paid: t("mock.paid"),
                due: t("mock.due"),
                units: [
                  { door: t("mock.unit", { no: 3 }), amount: formatAmount(1250, locale), state: "paid" },
                  { door: t("mock.unit", { no: 7 }), amount: formatAmount(1250, locale), state: "paid" },
                  { door: t("mock.unit", { no: 12 }), amount: formatAmount(2500, locale), state: "due" },
                ],
              }}
            />
          </Reveal>
        </div>
      </section>

      {/* KİMLER KULLANIYOR — zikzak şeritler */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("audienceTitle")}
          </h2>
          <p className="mt-3 text-fg-muted">{t("audienceSubtitle")}</p>
        </Reveal>

        <div className="mt-14 space-y-16 sm:space-y-24">
          <Reveal>
            <StoryRow
              eyebrow={t("residentEyebrow")}
              title={t("residentTitle")}
              body={t("residentBody")}
              points={t("residentPoints").split("|")}
              image={{ src: "/images/mobile-app-slide.png", alt: t("residentImageAlt") }}
            />
          </Reveal>
          <Reveal>
            <StoryRow
              reverse
              eyebrow={t("siteEyebrow")}
              title={t("siteTitle")}
              body={t("siteBody")}
              points={t("sitePoints").split("|")}
              image={{ src: "/images/social-life-slide.png", alt: t("siteImageAlt") }}
            />
          </Reveal>
        </div>
      </section>

      {/* ÖZELLİK GÖSTERİMİ */}
      <section className="border-y border-border bg-surface-sunken py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("killerTitle")}
            </h2>
            <p className="mt-3 max-w-2xl text-fg-muted">{t("killerSubtitle")}</p>
          </Reveal>

          <div className="mt-10">
            <FeatureShowcase
              items={content.killerFeatures}
              detailHref={featuresHref}
              detailLabel={t("featureDetail")}
              tablistLabel={t("tablistLabel")}
            />
          </div>
        </div>
      </section>

      {/*
        MODÜL DİZİNİ.

        Sekiz eşit kart yerine numaralı bir dizin. Gerekçe: kartların hepsi aynı
        ağırlıkta olduğu için sayfa burada bir "doku"ya dönüşüyor ve içerik
        okunmadan geçiliyordu. Dizin biçimi hem daha az yer kaplıyor hem de
        listenin **tam** olduğunu (01…08) görünür kılıyor — bölümün iddiası
        zaten bu: hiçbir modül pakete göre kısılmıyor.
      */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {t("modulesIndexLabel")}
          </p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("modulesTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-fg-muted">{t("modulesSubtitle")}</p>
        </Reveal>

        <Stagger
          className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2"
          itemAs="div"
        >
          {MODULE_KEYS.map((key, index) => (
            <article key={key} className="h-full bg-surface p-5 sm:p-6">
              <div className="flex items-baseline gap-3">
                <span aria-hidden className="font-heading text-xs font-bold tabular-nums text-fg-subtle">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-heading font-bold text-fg">{tModule(`${key}Title`)}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted ps-8">
                {tModule(`${key}Items`).split("|").join(" · ")}
              </p>
            </article>
          ))}
        </Stagger>
      </section>

      {/* FİYAT ÖNİZLEME */}
      <section className="border-y border-border bg-surface-sunken py-20">
        <div className="mx-auto max-w-4xl px-4">
          <Reveal className="text-center">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("pricingTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-fg-muted">{t("pricingSubtitle")}</p>
          </Reveal>

          <div className="mt-10">
            <PricingPreview
              locale={locale}
              signupUrl={`${siteConfig.env.appUrl}/kayit`}
              pricingHref={pricingHref}
              labels={{
                units: t("pricingUnits"),
                plan: t("pricingPlan"),
                monthly: t("pricingMonthly"),
                yearly: t("pricingYearly"),
                yearlyBadge: t("pricingYearlyBadge"),
                perUnit: t("pricingPerUnit"),
                cta: t("pricingCta"),
                all: t("pricingAll"),
                savings: t("savingsBadge", { pct: "{pct}" }),
                periodLabel: t("periodLabel"),
              }}
            />
          </div>
        </div>
      </section>

      {/* SSS */}
      <section className="mx-auto max-w-3xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("faqTitle")}
          </h2>
          <p className="mt-3 text-fg-muted">{t("faqSubtitle")}</p>
        </Reveal>

        <Accordion className="mt-8">
          {content.faqs.slice(0, 6).map((faq) => (
            <AccordionItem key={faq.question} title={faq.question} name="home-faq">
              {faq.answer}
            </AccordionItem>
          ))}
        </Accordion>

        <p className="mt-6 text-center">
          <Link
            href="/sss"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {t("faqAll")}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </p>
      </section>

      {/* KAPANIŞ */}
      <section className="relative isolate overflow-hidden bg-ink px-4 py-20 text-ink-fg">
        <BlueprintGrid className="text-ink-border" origin="top center" />
        <div className="relative mx-auto max-w-3xl text-center">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t("ctaTitle")}
          </h2>
          <p className="mt-4 text-ink-muted-fg">{t("ctaBody")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={`${siteConfig.env.appUrl}/kayit`}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t("ctaPrimary")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <Link
              href="/gecis"
              className="inline-flex items-center rounded-xl border border-ink-border px-6 py-3.5 font-semibold text-ink-fg transition-colors hover:bg-ink-hover"
            >
              {t("ctaSecondaryLink")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
