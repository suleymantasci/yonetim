import { getTranslations } from "next-intl/server";

import { maintenanceListResponse } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toTemplateOptions } from "../template-options";
import { MaintenanceForm } from "../maintenance-form";

export const dynamic = "force-dynamic";

/** `/panel/bakim/yeni` — tam sayfa sürüm (çekmece: `@modal/(.)bakim`). */
export default async function NewMaintenancePage() {
  await requirePermission("maintenance:write");
  const t = await getTranslations("app.maintenance");
  const tCommon = await getTranslations("common");

  // Şablon kütüphanesi liste ucundan geliyor (§9a); site kendi şablonlarını
  // tanımlamadıysa yasal tohum listesi dönüyor ve `id: null` oluyor.
  const { templates } = await apiGet(
    "/v1/panel/operations/maintenance",
    maintenanceListResponse,
  );

  return (
    <>
      <PageHeader
        title={t("newRecord")}
        description={t("newRecordDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/bakim" },
          { label: t("newRecord") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <MaintenanceForm
            templates={await toTemplateOptions(templates)}
            cancelHref="/panel/bakim"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
