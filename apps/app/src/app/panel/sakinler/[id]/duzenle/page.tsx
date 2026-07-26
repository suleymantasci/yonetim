import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getResidentDetail } from "@/lib/queries/residents";
import { getUnitOptions } from "@/lib/queries/units";
import { updateResident } from "../../actions";
import { ResidentForm } from "../../resident-form";

export const dynamic = "force-dynamic";

export default async function EditResidentPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");

  const [detail, units] = await Promise.all([getResidentDetail(ctx, id), getUnitOptions(ctx)]);
  if (!detail) notFound();

  const name = [detail.firstName, detail.lastName].filter(Boolean).join(" ") || t("unnamed");

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
              id: detail.userId,
              firstName: detail.firstName,
              lastName: detail.lastName,
              phone: detail.phone,
              email: detail.email,
              role: detail.roles[0] ?? "owner",
              locale: detail.locale,
              whatsappOptIn: detail.whatsappOptIn,
              emergencyContactName: detail.emergencyContactName,
              emergencyContactPhone: detail.emergencyContactPhone,
              notes: detail.notes,
              hasTckn: detail.tcknEncrypted !== null,
            }}
          />
        </CardBody>
      </Card>
    </>
  );
}
