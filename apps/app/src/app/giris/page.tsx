import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";

import { LoginForm } from "@/components/login-form";

export async function generateMetadata() {
  const t = await getTranslations("app.login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ devam?: string; site?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.login");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-fg">
            {siteConfig.brand.shortName.charAt(0)}
          </div>
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-fg">
            {siteConfig.brand.name}
          </h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {params.site
              ? t("subtitleForProperty", { property: params.site })
              : t("subtitleManagerAndResident")}
          </p>
        </div>

        <LoginForm next={params.devam ?? "/panel"} />

        <p className="mt-6 text-center text-xs text-fg-subtle">
          {t.rich("consentNote", {
            kvkk: (chunks) => (
              <a href={`${siteConfig.env.baseUrl}/kvkk`} className="underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
