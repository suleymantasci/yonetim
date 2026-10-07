import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Layers } from "lucide-react";
import Link from "@/components/link";

import { blockListResponse, duesPlanRow } from "@yonetim/contracts";
import { AppError, addMonths, currentPeriod, periodKey } from "@yonetim/core";
import { Alert, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { DuesPlanForm } from "../../plan-form";
import { RunPlanForm } from "../../run-plan-form";

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
    apiGet("/v1/panel/units/blocks", blockListResponse),
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
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

        {/*
          PLANI ÇALIŞTIRMA VE TOPLU BORÇ — PROJE-DURUMU §5.4.

          Bu iki kutu buraya kondu çünkü kullanıcının sorusu tam buradaydı:
          "plan oluştu, toplu borç girerken bu planı seçip uygulayabiliyor
          muyum?" Cevap ikiye ayrılıyor ve ayrımı ekranın kendisi anlatıyor:
          planı **çalıştırmak** dönemsel ve idempotent, plandan **toplu borç
          üretmek** tek seferlik ve plana bağlı değil.
        */}
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("runTitle")} description={t("runDescription")} />
            <CardBody>
              <RunPlanForm
                planId={plan.id}
                defaultPeriod={periodKey(currentPeriod())}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("bulkFromPlanTitle")}
              description={t("bulkFromPlanDescription")}
            />
            <CardBody className="space-y-3">
              <Alert tone="info">{t("bulkFromPlanNotice")}</Alert>
              <Link
                href={`/panel/borclar/toplu?plan=${plan.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                <Layers aria-hidden className="h-4 w-4" />
                {t("bulkFromPlanAction")}
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
