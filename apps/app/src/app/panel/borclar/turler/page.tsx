import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { debtTypeList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { DebtTypeManager } from "./debt-type-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.debtTypes");
  return { title: t("title") };
}

/**
 * `/panel/borclar/turler` — borçlandırma seçenekleri.
 *
 * Her tür borcun **kime** yazılacağını (oturan/malik) ve gecikmesinin nasıl
 * işleyeceğini taşır; tek ve toplu borçlandırma, aidat planı üretimi ve
 * geçiş bu kuralı kullanır.
 */
export default async function DebtTypesPage() {
  const ctx = await requirePermission("debt:read");
  const t = await getTranslations("app.debtTypes");
  const tDebts = await getTranslations("app.debts");
  const data = await apiGet("/v1/panel/debt-types", debtTypeList);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[
          { label: tDebts("title"), href: "/panel/borclar" },
          { label: t("title") },
        ]}
      />
      <DebtTypeManager
        rows={data.rows}
        siteLateFeeMonthlyPct={data.siteLateFeeMonthlyPct}
        canWrite={hasPermission(ctx.roles, "settings:write")}
      />
    </>
  );
}
