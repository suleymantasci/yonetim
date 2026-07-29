import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { staffDetail } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { StaffForm } from "../../staff-form";
import { toStaffDefaults } from "../../staff-defaults";

export const dynamic = "force-dynamic";

/** `/panel/personel/[id]/duzenle` — tam sayfa sürüm (çekmece: `@modal`). */
export default async function EditStaffPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("staff:write");
  const t = await getTranslations("app.staff");
  const tCommon = await getTranslations("common");

  // Ham telefonu yalnız bu uç döndürüyor; listedeki maskeli değerle form
  // doldurulsaydı kaydetmek numarayı maskeyle ezerdi.
  const detail = await apiGet(`/v1/panel/staff/${id}`, staffDetail).catch(
    () => null,
  );
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        title={t("editStaff", { name: detail.fullName })}
        description={t("editStaffDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/personel" },
          { label: detail.fullName },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <StaffForm
            defaults={toStaffDefaults(detail)}
            cancelHref="/panel/personel"
            submitLabel={tCommon("action.save")}
          />
        </CardBody>
      </Card>
    </>
  );
}
