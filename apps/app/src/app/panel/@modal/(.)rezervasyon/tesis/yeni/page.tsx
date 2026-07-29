import { getTranslations } from "next-intl/server";

import { RouteDrawer } from "@/components/route-drawer";
import { requirePermission } from "@/lib/context";
import { ResourceDrawerFlow } from "../resource-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/tesis/yeni` — çekmece sürümü. */
export default async function NewResourceModal() {
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  return (
    <RouteDrawer
      title={t("newResource")}
      description={t("newResourceDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <ResourceDrawerFlow submitLabel={tCommon("action.create")} />
    </RouteDrawer>
  );
}
