import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { blockListResponse, unitDetail } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { updateUnit } from "../../actions";
import { UnitForm } from "../../unit-form";

export const dynamic = "force-dynamic";

export default async function EditUnitPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");

  const [detail, blockList] = await Promise.all([
    apiGet(`/v1/panel/units/${id}`, unitDetail).catch((error: unknown) => {
      if (error instanceof AppError && error.code === "not_found") notFound();
      throw error;
    }),
    apiGet("/v1/panel/units/bloklar", blockListResponse),
  ]);

  const blocks = blockList.rows;
  const unit = detail.unit;

  return (
    <>
      <PageHeader
        title={t("editUnit", { number: unit.number })}
        breadcrumb={[
          { label: t("title"), href: "/panel/birimler" },
          { label: unit.number, href: `/panel/birimler/${id}` },
          { label: tCommon("action.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <UnitForm
            action={updateUnit}
            blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
            cancelHref={`/panel/birimler/${id}`}
            submitLabel={tCommon("action.save")}
            defaults={{
              id: unit.id,
              blockId: unit.blockId,
              number: unit.number,
              floor: unit.floor,
              type: unit.type,
              areaM2: unit.areaM2,
              landShare: unit.landShare,
              landShareNumerator: unit.landShareNumerator,
              landShareDenominator: unit.landShareDenominator,
              roomCount: unit.roomCount,
              residentCount: unit.residentCount,
              ownershipType: unit.ownershipType,
              duesExempt: unit.duesExempt,
              lateFeeExempt: unit.lateFeeExempt,
              duesMultiplier: unit.duesMultiplier,
              notes: unit.notes,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
