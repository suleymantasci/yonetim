import { getTranslations } from "next-intl/server";

import {
  reservationListResponse,
  residentOptionList,
  unitOptionList,
} from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { NewReservationFlow } from "./new-reservation-flow";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewReservationModal() {
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  const [list, residents, units] = await Promise.all([
    apiGet("/v1/panel/operations/rezervasyon", reservationListResponse),
    apiGet("/v1/panel/residents/secenekler", residentOptionList),
    apiGet("/v1/panel/units/secenekler", unitOptionList),
  ]);

  return (
    <RouteDrawer
      title={t("newReservation")}
      description={t("newReservationDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewReservationFlow
        resources={list.resources
          .filter((r) => r.isActive)
          .map((r) => ({
            id: r.id,
            name: r.name,
            requiresApproval: r.requiresApproval,
            openHour: r.openHour,
            closeHour: r.closeHour,
            maxHoursPerBooking: r.maxHoursPerBooking,
            capacity: r.capacity,
          }))}
        residents={residents.rows.map((r) => ({
          id: r.id,
          name:
            [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
            (r.phoneMasked ?? "—"),
        }))}
        units={units.map((u) => ({
          id: u.id,
          number: u.number,
          blockName: u.blockName,
        }))}
        labels={{
          submit: tCommon("action.create"),
          createdTitle: t("drawerCreatedTitle"),
          createdHint: t("drawerCreatedHint"),
          addAnother: t("drawerAddAnother"),
          done: tCommon("action.close"),
        }}
      />
    </RouteDrawer>
  );
}
