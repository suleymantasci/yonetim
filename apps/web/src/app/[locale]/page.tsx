import { ArrowRight, BadgeCheck, Check, Download, MessageSquare, Scale, ShieldCheck, Smartphone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { formatAmount, type Locale } from "@yonetim/i18n";
import { STANDARD_PLANS, savingsVsCompetitorPct } from "@yonetim/pricing";
import { faqSchema, jsonLdScript, softwareApplicationSchema } from "@yonetim/seo";
import { Accordion, AccordionItem } from "@yonetim/ui";
import { GradientMesh, Reveal, Stagger } from "@yonetim/ui/motion";

import { Link } from "@/i18n/navigation";
import { getContent } from "@/content";
import { richTags } from "@/components/rich-text";
import { MODULE_KEYS } from "@/components/module-list";
import { FeatureShowcase } from "@/components/home/feature-showcase";
import { PricingPreview } from "@/components/home/pricing-preview";
import { ProductMock } from "@/components/home/product-mock";
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
        HERO — başlık, alt metin ve birincil buton **sunucuda** render edilir.
        LCP öğesi buradaki `h1`; hidrasyonu beklemesi gerekmiyor. Hareket
        yalnızca dekoratif zeminde ve ürün gösteriminde.
      */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <GradientMesh />

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-semibold text-fg-muted backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-safe:animate-[pulse-ring_2.4s_ease-out_infinite]" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              {t("trialBadge")}
            </span>

            <h1 className="mx-auto mt-6 max-w-[19ch] font-heading text-4xl font-extrabold leading-[1.08] tracking-tight text-fg sm:text-6xl">
              {t("heroTitle")}{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {t("heroTitleAccent")}
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
              {t.rich("heroSubtitle", richTags)}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
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

            <p className="mt-4 text-sm text-fg-subtle">
              {t.rich("priceNote", {
                ...richTags,
                savings,
                price: formatAmount(cheapest.yearlyPriceTl, locale),
              })}
            </p>
          </div>

          <Reveal className="mx-auto mt-14 max-w-4xl" delay={0.1}>
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

      {/* GÜVEN ŞERİDİ */}
      <section className="border-b border-border bg-surface-sunken py-8" aria-label={t("trustTitle")}>
        <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4">
          {TRUST.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-center gap-2 text-sm font-medium text-fg-muted">
              <Icon aria-hidden className="h-4 w-4 text-primary" />
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* PROBLEM → ÇÖZÜM */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Stagger className="grid gap-6 md:grid-cols-3" itemAs="div">
          {([1, 2, 3] as const).map((index) => (
            <article
              key={index}
              className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-border-strong"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft font-heading text-sm font-bold text-primary-soft-fg">
                {index}
              </span>
              <h2 className="mt-4 font-heading text-lg font-bold text-fg">
                {t(`problem${index}Title`)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t(`problem${index}Body`)}</p>
            </article>
          ))}
        </Stagger>
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

      {/* MODÜLLER */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t("modulesTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-fg-muted">{t("modulesSubtitle")}</p>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" itemAs="div">
          {MODULE_KEYS.map((key) => (
            <article
              key={key}
              className="h-full rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary-soft"
            >
              <h3 className="font-heading font-bold text-fg">{tModule(`${key}Title`)}</h3>
              <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                {tModule(`${key}Items`)
                  .split("|")
                  .map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{item}</span>
                    </li>
                  ))}
              </ul>
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
        <GradientMesh className="opacity-40" />
        <div className="mx-auto max-w-3xl text-center">
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
