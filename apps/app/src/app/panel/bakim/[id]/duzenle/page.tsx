import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { maintenanceDetail, maintenanceListResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toTemplateOptions } from "../../template-options";
import { formatters } from "@/lib/format";
import { CompleteMaintenanceForm } from "../../complete-maintenance-form";
import { toMaintenanceDefaults } from "../../maintenance-defaults";
import { MaintenanceForm } from "../../maintenance-form";

export const dynamic = "force-dynamic";

/** `/panel/bakim/[id]/duzenle` — tam sayfa sürüm (çekmece: `@modal`). */
export default async function EditMaintenancePage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("maintenance:write");
  const t = await getTranslations("app.maintenance");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const [detail, options] = await Promise.all([
    apiGet(`/v1/panel/operations/bakim/${id}`, maintenanceDetail).catch(
      () => null,
    ),
    apiGet("/v1/panel/operations/bakim", maintenanceListResponse),
  ]);
  if (!detail) notFound();

  return (
    <>
      <PageHeader
        title={detail.label}
        description={t("editRecordDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/bakim" },
          { label: detail.label },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("editSection")} />
          <CardBody>
            <MaintenanceForm
              defaults={toMaintenanceDefaults(detail)}
              templates={await toTemplateOptions(options.templates)}
              cancelHref="/panel/bakim"
              submitLabel={tCommon("action.save")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("completeSection")}
            description={
              detail.lastDoneAt
                ? t("lastDoneAt", { date: f.date(detail.lastDoneAt) })
                : t("neverDone")
            }
          />
          <CardBody>
            <CompleteMaintenanceForm
              recordId={detail.id}
              intervalDays={detail.intervalDays}
              submitLabel={t("markDone")}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
