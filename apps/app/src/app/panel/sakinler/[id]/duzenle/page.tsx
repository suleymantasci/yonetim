import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { residentEditForm, unitOptionList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { updateResident } from "../../actions";
import { ResidentForm } from "../../resident-form";

export const dynamic = "force-dynamic";

export default async function EditResidentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");

  // Ham telefonu yalnız bu uç döndürüyor (`resident:write` + ayrı KVKK kaydı):
  // maskeli değer forma yazılsaydı kaydetmek numarayı maskeyle ezerdi.
  const [detail, units] = await Promise.all([
    apiGet(`/v1/panel/residents/${id}/edit`, residentEditForm).catch(
      () => null,
    ),
    apiGet("/v1/panel/units/options", unitOptionList),
  ]);
  if (!detail) notFound();

  const name =
    [detail.firstName, detail.lastName].filter(Boolean).join(" ") ||
    t("unnamed");

  return (
    <>
      <PageHeader
        title={t("editResident", { name })}
        breadcrumb={[
          { label: t("title"), href: "/panel/sakinler" },
          { label: name, href: `/panel/sakinler/${id}` },
          { label: tCommon("action.edit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <ResidentForm
            action={updateResident}
            units={units.map((unit) => ({
              id: unit.id,
              number: unit.number,
              blockName: unit.blockName,
            }))}
            cancelHref={`/panel/sakinler/${id}`}
            submitLabel={tCommon("action.save")}
            defaults={{
              id: detail.id,
              firstName: detail.firstName,
              lastName: detail.lastName,
              phone: detail.phone,
              email: detail.email,
              role: detail.role,
              locale: detail.locale,
              whatsappOptIn: detail.whatsappOptIn,
              emergencyContactName: detail.emergencyContactName,
              emergencyContactPhone: detail.emergencyContactPhone,
              bloodType: detail.bloodType,
              hasHealthConsent: detail.hasHealthConsent,
              notes: detail.notes,
              hasTckn: detail.hasTckn,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
