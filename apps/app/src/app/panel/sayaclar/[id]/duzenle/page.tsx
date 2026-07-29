import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { meterDetail, unitOptionList } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { MeterForm } from "../../meter-form";

export const dynamic = "force-dynamic";

/** `/panel/sayaclar/[id]/duzenle` — tam sayfa sürüm (çekmece: `@modal`). */
export default async function EditMeterPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");
  const tCommon = await getTranslations("common");

  const [detail, units] = await Promise.all([
    apiGet(`/v1/panel/operations/meters/${id}`, meterDetail).catch(() => null),
    apiGet("/v1/panel/units/options", unitOptionList),
  ]);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        title={t("editMeter")}
        description={t("editMeterDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/sayaclar" },
          { label: t("editMeter") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <MeterForm
            defaults={{
              id: detail.id,
              unitId: detail.unitId,
              type: detail.type,
              serialNo: detail.serialNo,
              isCommon: detail.isCommon,
              unitPriceKurus: detail.unitPriceMinor,
              initialValue: detail.initialValue,
              hasReadings: detail.hasReadings,
            }}
            units={units.map((u) => ({
              id: u.id,
              number: u.number,
              blockName: u.blockName,
            }))}
            cancelHref="/panel/sayaclar"
            submitLabel={tCommon("action.save")}
          />
        </CardBody>
      </Card>
    </>
  );
}
