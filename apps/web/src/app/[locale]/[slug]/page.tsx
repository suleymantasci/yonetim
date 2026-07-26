import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { siteConfig } from "@yonetim/config";
import type { Locale } from "@yonetim/i18n";
import { apartmentComplexSchema, breadcrumbSchema, jsonLdScript, pageMeta } from "@yonetim/seo";

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
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

      <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-fg-muted">
        {tType(tenant.type as never)}
      </span>
      <h1 className="mt-4 font-heading text-4xl font-extrabold">{tenant.name}</h1>
      {location ? <p className="mt-2 text-fg-muted">{location}</p> : null}

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-fg-subtle">{t("units")}</dt>
          <dd className="text-2xl font-bold">{tenant.unitCount}</dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-fg-subtle">{t("managementSystem")}</dt>
          <dd className="text-2xl font-bold">{siteConfig.brand.name}</dd>
        </div>
        <div className="rounded-lg border border-border p-4">
          <dt className="text-sm text-fg-subtle">{t("duesPayment")}</dt>
          <dd className="text-2xl font-bold">{t("online")}</dd>
        </div>
      </dl>

      <section className="mt-10 rounded-lg border border-border p-6">
        <h2 className="font-heading text-xl font-bold">{t("residentTitle")}</h2>
        <p className="mt-2 text-fg-muted">{t("residentBody")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`${siteConfig.env.appUrl}/giris?site=${tenant.slug}`}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            {t("residentLogin")}
          </a>
          <a
            href={`${siteConfig.env.appUrl}/kayit-talebi?site=${tenant.slug}`}
            className="rounded-lg border border-border-strong px-5 py-2.5 text-sm font-semibold hover:bg-hover"
          >
            {t("registerRequest")}
          </a>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-border p-6">
        <h2 className="font-heading text-xl font-bold">{t("npsTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("npsBody")}</p>
        <form
          action={`${siteConfig.env.appUrl}/api/public/nps`}
          method="post"
          className="mt-4 flex flex-wrap gap-2"
        >
          <input type="hidden" name="tenantSlug" value={tenant.slug} />
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="submit"
              name="score"
              value={i}
              className="h-10 w-10 rounded border border-border-strong text-sm font-semibold text-fg hover:border-primary hover:bg-primary-soft"
            >
              {i}
            </button>
          ))}
        </form>
      </section>

      <p className="mt-10 text-xs text-fg-subtle">
        {t("disclaimer", {
          brand: siteConfig.brand.name,
          email: siteConfig.brand.contact.email,
        })}
      </p>
    </div>
  );
}
