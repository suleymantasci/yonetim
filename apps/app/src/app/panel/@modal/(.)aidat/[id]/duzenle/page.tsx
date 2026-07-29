import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { blockListResponse, duesPlanRow } from "@yonetim/contracts";
import { AppError, addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { DuesPlanDrawerFlow } from "../../dues-plan-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/aidat/[id]/duzenle` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function EditDuesPlanModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");
  const tCommon = await getTranslations("common");

  const [plan, blockList] = await Promise.all([
    apiGet(`/v1/panel/dues-plans/${id}`, duesPlanRow).catch(
      (error: unknown) => {
        if (error instanceof AppError && error.code === "not_found") notFound();
        throw error;
      },
    ),
    apiGet("/v1/panel/units/bloklar", blockListResponse),
  ]);

  // `appliesTo` ve `mixWeights` jsonb; şemasız geldikleri için okurken daraltılır.
  const appliesTo = (plan.appliesTo ?? {}) as {
    blockIds?: string[];
    unitTypes?: string[];
    notes?: string | null;
  };
  const mixWeights = (plan.mixWeights ?? {}) as { equal?: number };

  return (
    <RouteDrawer
      title={t("editPlan", { name: plan.name })}
      description={t("newPlanDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <DuesPlanDrawerFlow
        blocks={blockList.rows.map((block) => ({
          id: block.id,
          name: block.name,
        }))}
        defaultStartPeriod={periodKey(addMonths(currentPeriod(), 1))}
        submitLabel={tCommon("action.save")}
        defaults={{
          id: plan.id,
          name: plan.name,
          period: plan.period,
          formula: plan.formula,
          baseAmountKurus: plan.baseAmountMinor,
          totalAmountKurus: plan.totalAmountMinor,
          mixEqualPct: mixWeights.equal ?? 50,
          dueDayOfMonth: plan.dueDayOfMonth,
          lateFeeMonthlyPct: plan.lateFeeMonthlyPct,
          lateFeeDailyMode: plan.lateFeeDailyMode,
          startPeriod: plan.startPeriod,
          endPeriod: plan.endPeriod,
          blockIds: appliesTo.blockIds ?? [],
          unitTypes: appliesTo.unitTypes ?? [],
          isActive: plan.isActive,
          notes: appliesTo.notes ?? null,
        }}
      />
    </RouteDrawer>
  );
}
