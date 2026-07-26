import { getTranslations } from "next-intl/server";

import { addMonths, currentPeriod, periodKey } from "@yonetim/core";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { DuesPlanForm } from "../plan-form";

export const dynamic = "force-dynamic";

export default async function NewDuesPlanPage() {
  const ctx = await requirePermission("dues:write");
  const t = await getTranslations("app.duesPlans");
  const tCommon = await getTranslations("common");
  const blocks = await getBlockOptions(ctx);

  return (
    <>
      <PageHeader
        title={t("newPlan")}
        description={t("newPlanDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/aidat" }, { label: t("newPlan") }]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <DuesPlanForm
            blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
            defaultStartPeriod={periodKey(addMonths(currentPeriod(), 1))}
            cancelHref="/panel/aidat"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
