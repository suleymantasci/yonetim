import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { blockListResponse, unitDetail } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { updateUnit } from "../../../../birimler/actions";
import { EditUnitFlow } from "./edit-unit-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/birimler/[id]/duzenle` — çekmece sürümü.
 *
 * Veri ve yetki mantığı tam sayfa sürümüyle birebir aynı; farklı olan tek şey
 * kabuk. Doğrudan adrese gidildiğinde kesme çalışmaz ve tam sayfa form açılır.
 */
export default async function EditUnitModal({
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
    apiGet("/v1/panel/units/blocks", blockListResponse),
  ]);

  const unit = detail.unit;

  return (
    <RouteDrawer
      title={t("editUnit", { number: unit.number })}
      description={t("editUnitDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <EditUnitFlow
        action={updateUnit}
        blocks={blockList.rows.map((block) => ({ id: block.id, name: block.name }))}
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
    </RouteDrawer>
  );
}
