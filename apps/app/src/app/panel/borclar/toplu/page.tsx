import { getTranslations } from "next-intl/server";

import { addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { BulkDebtWizard } from "./bulk-debt-wizard";

export const dynamic = "force-dynamic";

export default async function BulkDebtPage() {
  const ctx = await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const blocks = await getBlockOptions(ctx);

  return (
    <>
      <PageHeader
        title={t("bulkWizard")}
        description={t("bulkWizardDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/borclar" }, { label: t("bulkWizard") }]}
      />
      <BulkDebtWizard
        blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
        defaultPeriod={periodKey(addMonths(currentPeriod(), 1))}
        cancelHref="/panel/borclar"
      />
    </>
  );
}
