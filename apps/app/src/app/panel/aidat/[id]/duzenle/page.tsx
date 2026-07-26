import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { addMonths, currentPeriod, periodKey } from "@yonetim/core";
import { duesPlans, withTenant } from "@yonetim/db";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { DuesPlanForm } from "../../plan-form";

export const dynamic = "force-dynamic";

export default async function EditDuesPlanPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");
  const tCommon = await getTranslations("common");

  const [plan, blocks] = await Promise.all([
    withTenant(ctx.tenantId, async (tx) => {
      const rows = await tx.select().from(duesPlans).where(eq(duesPlans.id, id)).limit(1);
      return rows[0] ?? null;
    }),
    getBlockOptions(ctx),
  ]);
  if (!plan) notFound();

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
              baseAmountKurus: plan.baseAmountKurus ?? 0,
              totalAmountKurus: plan.totalAmountKurus ?? 0,
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
