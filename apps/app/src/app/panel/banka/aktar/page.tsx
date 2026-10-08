import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { bankOverviewResponse } from "@yonetim/contracts";
import { Alert } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { StatementImporter } from "./statement-importer";

export const dynamic = "force-dynamic";

/**
 * Banka dökümü aktar — dosya seç, sütunları kontrol et, içe aktar.
 * Her bankanın dökümü farklı; sistem başlığı ve sütunları tahmin ediyor,
 * kullanıcı önizlemede düzeltiyor, düzeltme hesaba kaydediliyor.
 */
export default async function StatementImportPage() {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  const { accounts } = await apiGet("/v1/panel/bank", bankOverviewResponse);
  const active = accounts.filter((a) => a.isActive);

  return (
    <>
      <PageHeader
        title={t("importTitle")}
        description={t("importDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/banka" }, { label: t("importTitle") }]}
        action={
          <Link
            href="/panel/banka"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {t("backToBank")}
          </Link>
        }
      />
      {active.length === 0 ? (
        <Alert tone="warning">
          {t("importNoAccount")}{" "}
          <Link href="/panel/banka/hesap/yeni" className="font-semibold underline">
            {t("newAccount")}
          </Link>
        </Alert>
      ) : (
        <StatementImporter
          accounts={active.map((a) => ({
            id: a.id,
            label: [a.bankName, a.accountName, a.ibanMasked].filter(Boolean).join(" · "),
          }))}
        />
      )}
    </>
  );
}
