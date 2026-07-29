import { getTranslations } from "next-intl/server";

import { unitOptionList } from "@yonetim/contracts";
import { addMonths, currentPeriod, periodKey } from "@yonetim/core";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import type { SearchParamsInput } from "@/lib/list-params";
import { DebtForm } from "./debt-form";

export const dynamic = "force-dynamic";

export default async function NewDebtPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const query = await searchParams;

  const units = await apiGet("/v1/panel/units/options", unitOptionList);
  const presetRaw = Array.isArray(query.birim) ? query.birim[0] : query.birim;
  const presetUnitId = units.some((unit) => unit.id === presetRaw)
    ? presetRaw
    : undefined;

  return (
    <>
      <PageHeader
        title={t("newDebt")}
        description={t("newDebtDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/borclar" },
          { label: t("newDebt") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <DebtForm
            units={units.map((unit) => ({
              id: unit.id,
              number: unit.number,
              blockName: unit.blockName,
            }))}
            presetUnitId={presetUnitId}
            defaultPeriod={periodKey(addMonths(currentPeriod(), 0))}
            cancelHref="/panel/borclar"
          />
        </CardBody>
      </Card>
    </>
  );
}
