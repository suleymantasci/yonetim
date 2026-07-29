import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { maintenanceDetail, maintenanceListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toTemplateOptions } from "../../../../bakim/template-options";
import { toMaintenanceDefaults } from "../../../../bakim/maintenance-defaults";
import { EditMaintenanceFlow } from "./edit-maintenance-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/bakim/[id]/duzenle` — çekmece sürümü.
 *
 * Bakım listesi tipik olarak "gecikenleri sırayla kapat" biçiminde
 * kullanılıyor; her kayıt için tam sayfaya gidip dönmek listedeki sırayı ve
 * kaydırma konumunu kaybettirirdi.
 */
export default async function EditMaintenanceModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("maintenance:write");
  const t = await getTranslations("app.maintenance");
  const tCommon = await getTranslations("common");

  const [detail, options] = await Promise.all([
    apiGet(`/v1/panel/operations/bakim/${id}`, maintenanceDetail).catch(
      () => null,
    ),
    apiGet("/v1/panel/operations/bakim", maintenanceListResponse),
  ]);
  if (!detail) notFound();

  return (
    <RouteDrawer
      title={detail.label}
      description={t("editRecordDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <EditMaintenanceFlow
        defaults={toMaintenanceDefaults(detail)}
        templates={await toTemplateOptions(options.templates)}
        intervalDays={detail.intervalDays}
        labels={{
          save: tCommon("action.save"),
          markDone: t("markDone"),
          editTab: t("editSection"),
          completeTab: t("completeSection"),
        }}
      />
    </RouteDrawer>
  );
}
