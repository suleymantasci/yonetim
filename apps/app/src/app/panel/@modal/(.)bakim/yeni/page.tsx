import { getTranslations } from "next-intl/server";

import { maintenanceListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toTemplateOptions } from "../../../bakim/template-options";
import { NewMaintenanceFlow } from "./new-maintenance-flow";

export const dynamic = "force-dynamic";

/** `/panel/bakim/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewMaintenanceModal() {
  await requirePermission("maintenance:write");
  const t = await getTranslations("app.maintenance");
  const tCommon = await getTranslations("common");

  const { templates } = await apiGet(
    "/v1/panel/operations/maintenance",
    maintenanceListResponse,
  );

  return (
    <RouteDrawer
      title={t("newRecord")}
      description={t("newRecordDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewMaintenanceFlow
        templates={await toTemplateOptions(templates)}
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
