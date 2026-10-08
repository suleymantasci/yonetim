import { getTranslations } from "next-intl/server";

import { Card, CardBody, Input, Textarea } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { EvrakNav } from "../evrak-nav";

export const dynamic = "force-dynamic";

/** Antetli evrak — başlıklı serbest yazı (site adı ve adresiyle). */
export default async function LetterheadPage() {
  await requirePermission("resident:read");
  const t = await getTranslations("app.letters");
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={t("title")} description={t("letterDescription")} />
      <EvrakNav active="letter" />
      <Card className="max-w-3xl">
        <CardBody>
          <form method="post" action="/panel/evrak/antetli/pdf" target="_blank" className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-fg-subtle">
                {t("letterNo")}
                <Input name="sayi" maxLength={40} className="mt-0.5" />
              </label>
              <label className="text-xs text-fg-subtle">
                {t("letterDate")}
                <Input name="tarih" type="date" defaultValue={today} className="mt-0.5" />
              </label>
              <label className="text-xs text-fg-subtle">
                {t("letterSubject")}
                <Input name="konu" required maxLength={160} className="mt-0.5" />
              </label>
            </div>
            <label className="block text-xs text-fg-subtle">
              {t("letterTo")}
              <Textarea name="alici" rows={2} maxLength={400} className="mt-0.5" />
            </label>
            <label className="block text-xs text-fg-subtle">
              {t("body")}
              <Textarea name="body" rows={14} required maxLength={12000} className="mt-0.5" />
            </label>
            <label className="block text-xs text-fg-subtle">
              {t("signer")}
              <Input name="imza" maxLength={80} defaultValue={t("management")} className="mt-0.5 sm:w-72" />
            </label>
            <div className="flex justify-end">
              <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                {t("letterPdf")}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
