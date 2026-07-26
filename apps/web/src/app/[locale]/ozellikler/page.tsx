import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import type { Locale } from "@yonetim/i18n";
import { pageMeta } from "@yonetim/seo";

import { alternatePaths, localizedPath } from "@/lib/paths";

import { getContent } from "@/content";
import { MODULE_KEYS } from "@/components/module-list";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.features" });
  return pageMeta({
    title: t("metaTitle"),
    description: t("metaDescription"),
    locale: locale as Locale,
    path: localizedPath("/ozellikler", locale as Locale),
    alternatePaths: alternatePaths("/ozellikler"),
  });
}

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("marketing.features");
  const tModule = await getTranslations("marketing.module");
  const content = getContent(locale);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <h1 className="font-heading text-4xl font-extrabold">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-fg-muted">{t("subtitle")}</p>

      <div className="mt-10 space-y-10">
        {content.killerFeatures.map((f) => (
          <section key={f.slug} id={f.slug} className="scroll-mt-20 border-l-4 border-primary pl-5">
            <h2 className="font-heading text-2xl font-bold">{f.title}</h2>
            <p className="mt-2 text-fg">{f.description}</p>
            <p className="mt-2 text-sm text-fg-muted">{f.detail}</p>
            <span className="mt-2 inline-block rounded bg-surface-sunken px-2 py-0.5 text-[11px] text-fg-subtle">
              {t("specSection", { ref: f.specRef })}
            </span>
          </section>
        ))}
      </div>

      <h2 className="mt-16 font-heading text-3xl font-extrabold">{t("moduleListTitle")}</h2>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {MODULE_KEYS.map((key) => (
          <div key={key} className="rounded-lg border border-border p-5">
            <h3 className="font-heading font-bold">{tModule(`${key}Title`)}</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {tModule(`${key}Items`)
                .split("|")
                .map((item) => (
                  <li key={item}>• {item}</li>
                ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="mt-16 font-heading text-3xl font-extrabold">{t("comparisonTitle")}</h2>
      <p className="mt-2 text-sm text-fg-subtle">{t("comparisonDisclaimer")}</p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-sunken text-left text-xs uppercase text-fg-subtle">
            <tr>
              <th scope="col" className="px-4 py-3">{t("comparisonFeature")}</th>
              <th scope="col" className="px-4 py-3">{t("comparisonUs")}</th>
              <th scope="col" className="px-4 py-3">Apsiyon</th>
              <th scope="col" className="px-4 py-3">Biyos</th>
              <th scope="col" className="px-4 py-3">Yönetimcell</th>
            </tr>
          </thead>
          <tbody>
            {content.comparison.map((row) => (
              <tr key={row.feature} className="border-t border-border">
                <td className="px-4 py-3 text-fg">{row.feature}</td>
                <Cell value={row.us} partial={t("partial")} soon={t("soon")} highlight />
                <Cell value={row.apsiyon} partial={t("partial")} soon={t("soon")} />
                <Cell value={row.biyos} partial={t("partial")} soon={t("soon")} />
                <Cell value={row.yonetimcell} partial={t("partial")} soon={t("soon")} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  value,
  partial,
  soon,
  highlight,
}: {
  value: boolean | "partial" | "soon";
  partial: string;
  soon: string;
  highlight?: boolean;
}) {
  if (value === true) {
    return (
      <td className={highlight ? "px-4 py-3 font-bold text-success-fg" : "px-4 py-3 text-success-fg"}>
        <span aria-hidden>✓</span>
        <span className="sr-only">{soon === "" ? "" : "✓"}</span>
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="px-4 py-3 text-fg-subtle">
        <span aria-hidden>—</span>
      </td>
    );
  }
  return <td className="px-4 py-3 text-warning-fg">{value === "soon" ? soon : partial}</td>;
}
