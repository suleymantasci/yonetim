import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BrandMark } from "@yonetim/ui";

import { DemoForm } from "./demo-form";

/**
 * Demo hesap talebi — landing'deki "Demo hesap iste" düğmelerinin hedefi.
 *
 * Form gönderilince hesap AÇILMIYOR: kişinin e-postasına bir onay bağlantısı
 * gidiyor, hesap o bağlantı tıklanınca kuruluyor. Böylece başkasının
 * adresine talep gönderen biri hesap açamıyor, toplu demo açan bir betik de
 * her talep için gerçek bir posta kutusuna ihtiyaç duyuyor.
 */
export async function generateMetadata() {
  const t = await getTranslations("app.demo");
  return { title: t("title"), robots: { index: false } };
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ tur?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("app.demo");
  const includes = ["people", "dues", "operations", "finance", "governance"] as const;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl grid-cols-1 gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start">
        <div className="lg:pt-6">
          <div className="w-fit">
            <BrandMark size={44} />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-fg sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-sm text-fg-muted sm:text-base">{t("subtitle")}</p>

          <h2 className="mt-8 text-sm font-semibold text-fg">{t("includesTitle")}</h2>
          <ul className="mt-3 space-y-2">
            {includes.map((key) => (
              <li key={key} className="flex items-start gap-2 text-sm text-fg-muted">
                <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success-fg" />
                <span>{t(`includes.${key}`)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 rounded-lg border border-border bg-surface p-3 text-xs text-fg-subtle">{t("note24h")}</p>
        </div>

        <DemoForm initialKind={params.tur === "firma" ? "company" : "manager"} />
      </div>
    </div>
  );
}
