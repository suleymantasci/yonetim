import { getTranslations } from "next-intl/server";

import { blockListResponse } from "@yonetim/contracts";
import { addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { DuesPlanDrawerFlow } from "../dues-plan-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/aidat/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewDuesPlanModal() {
  await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");
  const tCommon = await getTranslations("common");

  const { rows: blocks } = await apiGet(
    "/v1/panel/units/blocks",
    blockListResponse,
  );

  return (
    <RouteDrawer
      title={t("newPlan")}
      description={t("newPlanDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <DuesPlanDrawerFlow
        blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
        defaultStartPeriod={periodKey(addMonths(currentPeriod(), 1))}
        submitLabel={tCommon("action.create")}
      />
    </RouteDrawer>
  );
}
