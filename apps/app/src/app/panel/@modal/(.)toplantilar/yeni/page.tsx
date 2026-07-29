import { getTranslations } from "next-intl/server";

import { RouteDrawer } from "@/components/route-drawer";
import { requirePermission } from "@/lib/context";
import { MeetingDrawerFlow } from "../meeting-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/toplantilar/yeni` — çekmece sürümü. */
export default async function NewMeetingModal() {
  await requirePermission("meeting:write");
  const t = await getTranslations("app.meetings");
  const tCommon = await getTranslations("common");

  return (
    <RouteDrawer
      title={t("newMeeting")}
      description={t("newMeetingDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <MeetingDrawerFlow submitLabel={tCommon("action.create")} />
    </RouteDrawer>
  );
}
