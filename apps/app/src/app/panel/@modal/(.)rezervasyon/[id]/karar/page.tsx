import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { reservationListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { ReservationDecisionFlow } from "./reservation-decision-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/rezervasyon/[id]/karar` — çekmece sürümü.
 *
 * Onay bekleyen talepleri sırayla kapatmak bu ekranın asıl işi; her biri için
 * tam sayfaya gidip dönmek listedeki yeri kaybettirirdi.
 */
export default async function ReservationDecisionModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("reservation:approve");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const { rows, resources } = await apiGet(
    "/v1/panel/operations/rezervasyon",
    reservationListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  const resource = resources.find((r) => r.id === row.resourceId);

  return (
    <RouteDrawer
      title={resource?.name ?? row.resourceName ?? t("decideTitle")}
      description={`${f.dateTime(row.startAt)} → ${f.dateTime(row.endAt)}`}
      closeLabel={tCommon("action.close")}
      size="lg"
    >
      <ReservationDecisionFlow
        reservationId={row.id}
        currentStatus={row.status}
        submitLabel={tCommon("action.save")}
      />
    </RouteDrawer>
  );
}
