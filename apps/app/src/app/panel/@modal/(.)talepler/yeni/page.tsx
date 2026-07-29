import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { requestListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { NewRequestFlow } from "./new-request-flow";

export const dynamic = "force-dynamic";

/** `/panel/talepler/yeni` — çekmece sürümü. Veri hazırlığı tam sayfayla aynı. */
export default async function NewRequestModal() {
  const ctx = await requirePermission("request:write");
  const t = await getTranslations("app.requests");
  const tCommon = await getTranslations("common");

  const { units, assignees } = await apiGet(
    "/v1/panel/operations/requests",
    requestListResponse,
  );

  return (
    <RouteDrawer
      title={t("newRequest")}
      description={t("newRequestDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewRequestFlow
        units={units}
        assignees={assignees}
        canAssign={hasPermission(ctx.roles, "request:assign")}
        labels={{
          submit: tCommon("action.create"),
          createdTitle: t("drawerCreatedTitle"),
          createdHint: t("drawerCreatedHint"),
          addAnother: t("drawerAddAnother"),
          openDetail: tCommon("action.detail"),
          done: tCommon("action.close"),
        }}
      />
    </RouteDrawer>
  );
}
