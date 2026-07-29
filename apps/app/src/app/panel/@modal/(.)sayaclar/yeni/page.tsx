import { getTranslations } from "next-intl/server";

import { unitOptionList } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { NewMeterFlow } from "./new-meter-flow";

export const dynamic = "force-dynamic";

/** `/panel/sayaclar/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewMeterModal() {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");
  const tCommon = await getTranslations("common");

  const units = await apiGet("/v1/panel/units/secenekler", unitOptionList);

  return (
    <RouteDrawer
      title={t("newMeter")}
      description={t("newMeterDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewMeterFlow
        units={units.map((u) => ({
          id: u.id,
          number: u.number,
          blockName: u.blockName,
        }))}
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
