import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resourceDetail } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { ResourceForm } from "../../../resource-form";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/tesis/[id]/duzenle` — tam sayfa (çekmece: `@modal`). */
export default async function EditResourcePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  const detail = await apiGet(
    `/v1/panel/operations/reservations/resources/${id}`,
    resourceDetail,
  ).catch(() => null);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        title={detail.name}
        description={t("editResourceDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/rezervasyon" },
          { label: detail.name },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <ResourceForm
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
            cancelHref="/panel/rezervasyon"
            submitLabel={tCommon("action.save")}
          />
        </CardBody>
      </Card>
    </>
  );
}
