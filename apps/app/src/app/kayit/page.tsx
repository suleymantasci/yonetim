import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { BrandMark } from "@yonetim/ui";

import { SignupForm } from "./signup-form";

/**
 * Site / yönetim firması kaydı.
 *
 * `apps/web`'in bütün CTA'ları buraya bakıyordu ve sayfa yoktu: pazarlama
 * sitesindeki her "Ücretsiz dene" düğmesi 404'e çıkıyordu. Kampanya
 * (`?kampanya=`) ve rakip geçişi (`?gecis=`) parametreleri kayda yazılıyor —
 * hangi kanalın dönüştüğü ancak burada öğrenilebiliyor.
 */
export async function generateMetadata() {
  const t = await getTranslations("app.signup");
  return { title: t("title") };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ kampanya?: string; gecis?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.signup");

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
          <p className="mt-1 text-sm text-fg-subtle">
            {t("subtitle", { days: siteConfig.billing.trial.durationDays })}
          </p>
        </div>

        <SignupForm campaign={params.kampanya} migrationSource={params.gecis} />

        <p className="mt-6 text-center text-xs text-fg-subtle">
          {t("noCardNote")}
        </p>
      </div>
    </div>
  );
}
