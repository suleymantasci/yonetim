import { ArrowRight, Building2, CreditCard, MapPin } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { apartmentComplexSchema, breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";
import { BlueprintGrid, BrandWash, Reveal } from "@yonetim/ui/motion";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getPublicTenant } from "@/lib/public-tenant";

/**
 * Site landing page — SPEC Bölüm 3.9 / 6.14.
 * ISR ile günde bir yenilenir (Bölüm 10.1).
 */
export const revalidate = 86_400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const tenant = await getPublicTenant(slug);
  if (!tenant) return { robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: "marketing.landing" });
  const location = [tenant.district, tenant.city].filter(Boolean).join(", ");
  const suffix = location ? ` — ${location}` : "";

  return pageMeta({
    title: t("metaTitle", { property: tenant.name, location: suffix }),
    description: t("metaDescription", {
      property: tenant.name,
      location: location ? ` (${location})` : "",
    }),
    locale: locale as Locale,
    path: localizedPath("/[slug]", locale as Locale, { slug: tenant.slug }),
    alternatePaths: alternatePaths("/[slug]", { slug: tenant.slug }),
  });
}

export default async function TenantLandingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const tenant = await getPublicTenant(slug);
  if (!tenant) notFound();

  const t = await getTranslations("marketing.landing");
  const tType = await getTranslations("enum.tenantType");
  const location = [tenant.neighborhood, tenant.district, tenant.city].filter(Boolean).join(", ");

  const stats = [
    { key: "units", value: String(tenant.unitCount), icon: Building2 },
    { key: "managementSystem", value: siteConfig.brand.name, icon: CreditCard },
    { key: "duesPayment", value: t("online"), icon: CreditCard },
  ] as const;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            apartmentComplexSchema({
              name: tenant.name,
              slug: tenant.slug,
              city: tenant.city,
              district: tenant.district,
              address: tenant.addressLine,
              latitude: tenant.latitude,
              longitude: tenant.longitude,
              unitCount: tenant.unitCount,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbSchema([
              { name: siteConfig.brand.name, url: siteConfig.env.baseUrl },
              { name: tenant.name, url: `${siteConfig.env.baseUrl}/${tenant.slug}` },
            ]),
          ),
        }}
      />

      <section className="relative isolate overflow-hidden border-b border-border">
        <BrandWash />
        <BlueprintGrid origin="top center" />
        <div className="relative mx-auto max-w-4xl px-4 pb-12 pt-14">
          <span className="rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-semibold text-fg-muted backdrop-blur">
            {tType(tenant.type as never)}
          </span>
          <h1 className="mt-5 font-heading text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
            {tenant.name}
          </h1>
          {location ? (
            <p className="mt-3 flex items-center gap-1.5 text-fg-muted">
              <MapPin aria-hidden className="h-4 w-4 shrink-0 text-fg-subtle" />
              {location}
            </p>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12">
        <dl className="grid gap-4 sm:grid-cols-3">
          {stats.map(({ key, value, icon: Icon }) => (
            <div key={key} className="rounded-2xl border border-border bg-surface p-5">
              <dt className="flex items-center gap-2 text-sm text-fg-subtle">
                <Icon aria-hidden className="h-4 w-4" />
                {t(key)}
              </dt>
              <dd className="mt-2 font-heading text-2xl font-extrabold tabular-nums text-fg">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <Reveal
          as="section"
          className="mt-8 rounded-2xl border border-border bg-surface-sunken p-6 sm:p-8"
        >
          <h2 className="font-heading text-xl font-bold text-fg">{t("residentTitle")}</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-fg-muted">{t("residentBody")}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={`${siteConfig.env.appUrl}/giris?site=${tenant.slug}`}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {t("residentLogin")}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <a
              href={`${siteConfig.env.appUrl}/kayit-talebi?site=${tenant.slug}`}
              className="inline-flex items-center rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold text-fg transition-colors hover:bg-hover"
            >
              {t("registerRequest")}
            </a>
          </div>
        </Reveal>

        {/*
          NPS ölçeği. Düğmeler `submit`: JavaScript olmadan da çalışıyor ve
          form POST ile gidiyor — bu davranış korundu.
          EKLENEN: uç etiketleri. Çıplak bir 0–10 satırında hangi ucun "iyi"
          olduğu belirsizdi; NPS'te yanlış yönde okunan bir ölçek veriyi
          sessizce bozar. Ölçek `fieldset`/`legend` içine alındı, böylece ekran
          okuyucu her düğmeyi sorunun bağlamıyla birlikte okuyor.
        */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <form
            action={`${siteConfig.env.appUrl}/api/public/nps`}
            method="post"
            className="min-w-0"
          >
            <input type="hidden" name="tenantSlug" value={tenant.slug} />
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="font-heading text-xl font-bold text-fg">{t("npsTitle")}</legend>
              <p className="mt-1 text-sm text-fg-subtle">{t("npsBody")}</p>

              <div className="mt-5 flex flex-wrap gap-1.5">
                {Array.from({ length: 11 }, (_, score) => (
                  <button
                    key={score}
                    type="submit"
                    name="score"
                    value={score}
                    className="h-11 w-11 rounded-xl border border-border-strong bg-surface text-sm font-semibold tabular-nums text-fg transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {score}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex justify-between text-xs text-fg-subtle">
                <span>{t("npsLowLabel")}</span>
                <span>{t("npsHighLabel")}</span>
              </div>
            </fieldset>
          </form>
        </section>

        <p className="mt-10 text-xs leading-relaxed text-fg-subtle">
          {t("disclaimer", {
            brand: siteConfig.brand.name,
            email: siteConfig.brand.contact.email,
          })}
        </p>
      </div>
    </>
  );
}
