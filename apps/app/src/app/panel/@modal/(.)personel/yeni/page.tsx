import { getTranslations } from "next-intl/server";

import { RouteDrawer } from "@/components/route-drawer";
import { requirePermission } from "@/lib/context";
import { NewStaffFlow } from "./new-staff-flow";

export const dynamic = "force-dynamic";

/** `/panel/personel/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewStaffModal() {
  await requirePermission("staff:write");
  const t = await getTranslations("app.staff");
  const tCommon = await getTranslations("common");

  return (
    <RouteDrawer
      title={t("newStaff")}
      description={t("newStaffDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewStaffFlow
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
