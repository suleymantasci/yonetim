import { getTranslations } from "next-intl/server";

import { reservationListResponse } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { reservationPeople } from "../people";
import { ReservationForm } from "../reservation-form";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/yeni` — tam sayfa (çekmece: `@modal/(.)rezervasyon`). */
export default async function NewReservationPage() {
  const ctx = await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  const [list, people] = await Promise.all([
    apiGet("/v1/panel/operations/reservations", reservationListResponse),
    reservationPeople(ctx),
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
            residents={people.residents}
            units={people.units}
            cancelHref="/panel/rezervasyon"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
