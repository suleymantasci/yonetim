import { getTranslations } from "next-intl/server";

import { BrandMark } from "@yonetim/ui";

import { AccessRequestForm } from "./request-form";

/**
 * Sakin erişim talebi — `/[slug]` landing sayfasından `?site=` ile geliniyor.
 *
 * `apps/web/src/app/[locale]/[slug]/page.tsx` bu adrese bağlantı veriyordu ve
 * sayfa yoktu: her site landing sayfasındaki "Sakin girişi talep et"
 * düğmesi 404'e çıkıyordu.
 */
export async function generateMetadata() {
  const t = await getTranslations("app.accessRequest");
  return { title: t("title"), robots: { index: false } };
}

export default async function AccessRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.accessRequest");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto w-fit">
            <BrandMark size={44} />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-fg">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-fg-subtle">{t("subtitle")}</p>
        </div>

        <AccessRequestForm tenantSlug={params.site ?? ""} tenantName={params.site} />

        <p className="mt-6 text-center text-xs text-fg-subtle">{t("privacyNote")}</p>
      </div>
    </div>
  );
}
