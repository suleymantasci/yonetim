import { getTranslations } from "next-intl/server";

import { blockListResponse, debtTypeList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { HeatCostForm } from "./heat-cost-form";

export const dynamic = "force-dynamic";

/** Isı pay ölçerli paylaşım — fatura + dönemin ısı/sıcak su okumaları → daire borcu. */
export default async function HeatCostPage() {
  await requirePermission("meter:write");
  const t = await getTranslations("app.heatCost");
  const tMeters = await getTranslations("app.meters");
  const [{ rows: blocks }, types] = await Promise.all([
    apiGet("/v1/panel/units/blocks", blockListResponse),
    apiGet("/v1/panel/debt-types", debtTypeList),
  ]);
  const now = new Date(Date.now() + 3 * 3_600_000);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tMeters("title"), href: "/panel/sayaclar" }, { label: t("title") }]}
      />
      <HeatCostForm
        defaultPeriod={prev.toISOString().slice(0, 7)}
        blocks={blocks.map((b) => ({ id: b.id, name: b.name }))}
        debtTypes={types.rows.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name, baseKind: x.baseKind }))}
      />
    </>
  );
}
