import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { blockListResponse, duesPlanRow } from "@yonetim/contracts";
import { AppError, addMonths, currentPeriod, periodKey } from "@yonetim/core";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { DuesPlanForm } from "../../plan-form";

export const dynamic = "force-dynamic";

export default async function EditDuesPlanPage({
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
  const blocks = blockList.rows;

  // `appliesTo` ve `mixWeights` jsonb; şemasız geldikleri için okurken daraltılır.
  const appliesTo = (plan.appliesTo ?? {}) as {
    blockIds?: string[];
    unitTypes?: string[];
    notes?: string | null;
  };
  const mixWeights = (plan.mixWeights ?? {}) as { equal?: number };

  return (
    <>
      <PageHeader
        title={t("editPlan", { name: plan.name })}
        breadcrumb={[
          { label: t("title"), href: "/panel/aidat" },
          { label: plan.name },
          { label: tCommon("action.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <DuesPlanForm
            blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
            defaultStartPeriod={periodKey(addMonths(currentPeriod(), 1))}
            cancelHref="/panel/aidat"
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
        </CardBody>
      </Card>
    </>
  );
}
