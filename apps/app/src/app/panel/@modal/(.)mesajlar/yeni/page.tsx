import { getTranslations } from "next-intl/server";

import { residentOptionList } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { MessageDrawerFlow } from "./message-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/mesajlar/yeni` — çekmece sürümü. */
export default async function NewMessageModal() {
  await requirePermission("message:write");
  const t = await getTranslations("app.messages");
  const tCommon = await getTranslations("common");

  const residents = await apiGet(
    "/v1/panel/residents/options",
    residentOptionList,
  );

  return (
    <RouteDrawer
      title={t("newMessage")}
      description={t("newMessageDescription")}
      closeLabel={tCommon("action.close")}
      size="lg"
    >
      <MessageDrawerFlow
        residents={residents.rows.map((r) => ({
          id: r.id,
          name:
            [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
            (r.phoneMasked ?? "—"),
        }))}
        submitLabel={t("send")}
      />
    </RouteDrawer>
  );
}
