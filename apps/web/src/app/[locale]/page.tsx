import { ArrowRight, BadgeCheck, Check, Download, MessageSquare, Scale, ShieldCheck, Smartphone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { formatAmount, type Locale } from "@yonetim/i18n";
import { STANDARD_PLANS, savingsVsCompetitorPct } from "@yonetim/pricing";
import { faqSchema, jsonLdScript, softwareApplicationSchema } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { BlueprintGrid, Reveal, Stagger } from "@yonetim/ui/motion";

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
import { DuesSimulator } from "@/components/home/dues-simulator";
import { MigrationDesk } from "@/components/home/migration-desk";
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
        <BlueprintGrid />

        {/* `relative`: konumlandırılmış dekor, konumlandırılmamış içeriğin
            üstüne boyanır — ızgara çizgileri başlığın üstünden geçiyordu. */}
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,6.5fr)_minmax(0,5fr)] lg:gap-12">
            <div>
              <h1 className="font-heading text-4xl font-extrabold leading-[1.06] tracking-tight text-fg sm:text-5xl xl:text-6xl">
                {t("heroTitle")} <span className="text-primary">{t("heroTitleAccent")}</span>
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
                  href="/fiyatlandirma"
                  className="inline-flex items-center rounded-xl border border-border-strong bg-surface px-6 py-3.5 font-semibold text-fg shadow-sm transition-all duration-150 hover:border-fg/50 hover:bg-hover active:scale-[0.98]"
                >
                  {t("ctaSecondary")}
                </Link>
              </div>

              {/* Deneme koşulu artık kararın yanında: buton, sonra koşul. */}
              <p className="mt-4 max-w-md text-sm text-fg-subtle">{t("ctaNote")}</p>

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
      <section className="border-b border-border bg-surface-sunken py-3 sm:py-4" aria-label={t("trustTitle")}>
        <div className="mx-auto max-w-6xl px-4">
          <ul className="grid divide-y divide-border sm:grid-cols-3 sm:divide-y-0 sm:divide-x lg:grid-cols-6">
            {TRUST.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="flex items-center gap-2 px-3 py-3 text-xs font-medium text-fg-muted"
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* DEFTER — "bugün elle nasıl yürüyor" ↔ "panelde nereye düşüyor" */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("ledgerTitle")}
          </h2>
          <p className="mt-3 max-w-prose text-fg-muted">{t("ledgerSubtitle")}</p>
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
        ÜRÜN ÖNİZLEME — canlı ekran görüntüsü.
      */}
      <section className="bg-surface-sunken py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Reveal>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("panelTitle")}
            </h2>
            <p className="mt-4 max-w-prose text-lg leading-relaxed text-fg-muted">
              {t("panelBody")}
            </p>
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

      {/* İNTERAKTİF AİDAT & KAZANÇ SİMÜLATÖRÜ */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <DuesSimulator locale={locale} />
        </Reveal>
      </section>

      {/* KİMLER KULLANIYOR — zikzak şeritler */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("audienceTitle")}
          </h2>
          <p className="mt-3 max-w-prose text-fg-muted">{t("audienceSubtitle")}</p>
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
      <section className="bg-surface-sunken py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("killerTitle")}
            </h2>
            <p className="mt-3 max-w-prose text-fg-muted">{t("killerSubtitle")}</p>
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
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("modulesTitle")}
          </h2>
          <p className="mt-3 max-w-prose text-fg-muted">{t("modulesSubtitle")}</p>
        </Reveal>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
          {/* Üst Mimari Başlık Şeridi */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken/70 px-6 py-3.5">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-fg-subtle">
              {t("modulesTag")}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-success">
              <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
              {t("modulesBadge")}
            </span>
          </div>

          <Stagger
            className="grid bg-border gap-px sm:grid-cols-2"
            itemAs="div"
            itemClassName="bg-surface h-full"
          >
            {MODULE_KEYS.map((key, index) => (
              <div key={key} className="flex h-full flex-col justify-start p-6 transition-colors hover:bg-hover/40">
                <div className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="font-heading text-xs font-bold tabular-nums text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-heading font-bold text-fg">{tModule(`${key}Title`)}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted ps-7">
                  {tModule(`${key}Items`).split("|").join(" · ")}
                </p>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* FİYAT ÖNİZLEME */}
      <section className="bg-surface-sunken py-20">
        <div className="mx-auto max-w-4xl px-4">
          <Reveal className="text-center">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
              {t("pricingTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-prose text-fg-muted">{t("pricingSubtitle")}</p>
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
      <section className="mx-auto max-w-2xl px-4 py-20">
        <Reveal className="text-center">
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("faqTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-prose text-fg-muted">{t("faqSubtitle")}</p>
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

      {/* KAPANIŞ — KESİNTİSİZ GEÇİŞ & VERİ AKTARIM MASASI */}
      <section className="border-t border-border bg-surface-sunken/20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Sol Kolon: Doğrudan Değer, Eylem ve Şartname Güvencesi */}
            <div>
              <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl lg:text-5xl leading-[1.12]">
                {t("ctaTitle")}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
                {t("ctaBody")}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href={`${siteConfig.env.appUrl}/kayit`}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-heading text-base font-bold text-primary-fg shadow-sm transition-all duration-150 hover:bg-primary-hover hover:shadow active:scale-[0.98]"
                >
                  <span>{t("ctaPrimary")}</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <Link
                  href="/gecis"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 font-heading text-base font-semibold text-fg shadow-xs transition-all duration-150 hover:bg-hover hover:border-border-strong active:scale-[0.98]"
                >
                  <span>{t("ctaSecondaryLink")}</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4 text-fg-muted" />
                </Link>
              </div>

              {/* Mimari Güven & Şartname Şeridi */}
              <div className="mt-10 border-t border-border/80 pt-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="font-mono text-base font-bold text-fg sm:text-lg">
                      {t("ctaTrustStat1Value")}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted">
                      {t("ctaTrustStat1Label")}
                    </div>
                  </div>
                  <div className="border-s border-border ps-4">
                    <div className="font-mono text-base font-bold text-fg sm:text-lg">
                      {t("ctaTrustStat2Value")}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted">
                      {t("ctaTrustStat2Label")}
                    </div>
                  </div>
                  <div className="border-s border-border ps-4">
                    <div className="font-mono text-base font-bold text-fg sm:text-lg">
                      {t("ctaTrustStat3Value")}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted">
                      {t("ctaTrustStat3Label")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ Kolon: Canlı Veri Aktarım & Eşleşme Konsolu */}
            <div>
              <MigrationDesk
                labels={{
                  tag: t("migrationDesk.tag"),
                  status: t("migrationDesk.status"),
                  tabApsiyon: t("migrationDesk.tabApsiyon"),
                  tabExcel: t("migrationDesk.tabExcel"),
                  tabNew: t("migrationDesk.tabNew"),
                  formatLabel: t("migrationDesk.formatLabel"),
                  timeLabel: t("migrationDesk.timeLabel"),
                  apsiyonFormat: t("migrationDesk.apsiyonFormat"),
                  apsiyonTime: t("migrationDesk.apsiyonTime"),
                  excelFormat: t("migrationDesk.excelFormat"),
                  excelTime: t("migrationDesk.excelTime"),
                  newFormat: t("migrationDesk.newFormat"),
                  newTime: t("migrationDesk.newTime"),
                  apsiyonRow1Title: t("migrationDesk.apsiyonRow1Title"),
                  apsiyonRow1Desc: t("migrationDesk.apsiyonRow1Desc"),
                  apsiyonRow1Badge: t("migrationDesk.apsiyonRow1Badge"),
                  apsiyonRow2Title: t("migrationDesk.apsiyonRow2Title"),
                  apsiyonRow2Desc: t("migrationDesk.apsiyonRow2Desc"),
                  apsiyonRow2Badge: t("migrationDesk.apsiyonRow2Badge"),
                  apsiyonRow3Title: t("migrationDesk.apsiyonRow3Title"),
                  apsiyonRow3Desc: t("migrationDesk.apsiyonRow3Desc"),
                  apsiyonRow3Badge: t("migrationDesk.apsiyonRow3Badge"),
                  excelRow1Title: t("migrationDesk.excelRow1Title"),
                  excelRow1Desc: t("migrationDesk.excelRow1Desc"),
                  excelRow1Badge: t("migrationDesk.excelRow1Badge"),
                  excelRow2Title: t("migrationDesk.excelRow2Title"),
                  excelRow2Desc: t("migrationDesk.excelRow2Desc"),
                  excelRow2Badge: t("migrationDesk.excelRow2Badge"),
                  excelRow3Title: t("migrationDesk.excelRow3Title"),
                  excelRow3Desc: t("migrationDesk.excelRow3Desc"),
                  excelRow3Badge: t("migrationDesk.excelRow3Badge"),
                  newRow1Title: t("migrationDesk.newRow1Title"),
                  newRow1Desc: t("migrationDesk.newRow1Desc"),
                  newRow1Badge: t("migrationDesk.newRow1Badge"),
                  newRow2Title: t("migrationDesk.newRow2Title"),
                  newRow2Desc: t("migrationDesk.newRow2Desc"),
                  newRow2Badge: t("migrationDesk.newRow2Badge"),
                  newRow3Title: t("migrationDesk.newRow3Title"),
                  newRow3Desc: t("migrationDesk.newRow3Desc"),
                  newRow3Badge: t("migrationDesk.newRow3Badge"),
                  guaranteeFooter: t("migrationDesk.guaranteeFooter"),
                }}
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
