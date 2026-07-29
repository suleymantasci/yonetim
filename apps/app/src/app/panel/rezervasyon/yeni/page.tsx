import { getTranslations } from "next-intl/server";

import {
  reservationListResponse,
  residentOptionList,
  unitOptionList,
} from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { ReservationForm } from "../reservation-form";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/yeni` — tam sayfa (çekmece: `@modal/(.)rezervasyon`). */
export default async function NewReservationPage() {
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  const [list, residents, units] = await Promise.all([
    apiGet("/v1/panel/operations/reservations", reservationListResponse),
    apiGet("/v1/panel/residents/options", residentOptionList),
    apiGet("/v1/panel/units/options", unitOptionList),
  ]);

  return (
    <>
      <PageHeader
        title={t("newReservation")}
        description={t("newReservationDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/rezervasyon" },
          { label: t("newReservation") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <ReservationForm
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
            cancelHref="/panel/rezervasyon"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
