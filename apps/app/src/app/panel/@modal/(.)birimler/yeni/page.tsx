import { getTranslations } from "next-intl/server";

import { blockListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { createUnit } from "../../../birimler/actions";
import { NewUnitFlow } from "./new-unit-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/birimler/yeni` — listeden açıldığında çekmece.
 *
 * Veri ve yetki kontrolü tam sayfa sürümüyle **aynı**; farklı olan tek şey
 * kabuk. Formun kendisi (`UnitForm`) ikinci kez yazılmıyor.
 */
export default async function NewUnitModal() {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const { rows: blocks } = await apiGet("/v1/panel/units/bloklar", blockListResponse);

  return (
    <RouteDrawer
      title={t("newUnit")}
      description={t("newUnitDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewUnitFlow
        action={createUnit}
        blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
        labels={{
          submit: tCommon("action.create"),
          cancel: tCommon("action.cancel"),
          createdTitle: t("drawerCreatedTitle"),
          createdHint: t("drawerCreatedHint"),
          addResident: t("drawerAddResident"),
          addAnother: t("drawerAddAnother"),
          done: tCommon("action.close"),
          openDetail: tCommon("action.detail"),
        }}
      />
    </RouteDrawer>
  );
}
