import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resourceDetail } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { ResourceDrawerFlow } from "../../resource-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/tesis/[id]/duzenle` — çekmece sürümü. */
export default async function EditResourceModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  const detail = await apiGet(
    `/v1/panel/operations/rezervasyon/tesisler/${id}`,
    resourceDetail,
  ).catch(() => null);
  if (!detail) notFound();

  return (
    <RouteDrawer
      title={detail.name}
      description={t("editResourceDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <ResourceDrawerFlow
        defaults={{
          id: detail.id,
          name: detail.name,
          kind: detail.kind,
          capacity: detail.capacity,
          feeKurus: detail.feeMinor,
          feeUnit: detail.feeUnit,
          depositKurus: detail.depositMinor,
          requiresApproval: detail.requiresApproval,
          maxHoursPerBooking: detail.maxHoursPerBooking,
          maxBookingsPerMonth: detail.maxBookingsPerMonth,
          openHour: detail.openHour,
          closeHour: detail.closeHour,
          rulesText: detail.rulesText,
          isActive: detail.isActive,
        }}
        submitLabel={tCommon("action.save")}
      />
    </RouteDrawer>
  );
}
