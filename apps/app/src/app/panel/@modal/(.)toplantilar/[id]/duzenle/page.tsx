import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { meetingListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toMeetingDefaults } from "../../../../toplantilar/meeting-defaults";
import { MeetingDrawerFlow } from "../../meeting-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/toplantilar/[id]/duzenle` — çekmece sürümü. */
export default async function EditMeetingModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("meeting:write");
  const t = await getTranslations("app.meetings");
  const tCommon = await getTranslations("common");

  const { rows } = await apiGet(
    "/v1/panel/communication/toplantilar",
    meetingListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  return (
    <RouteDrawer
      title={row.title}
      description={t("editMeetingDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <MeetingDrawerFlow
        defaults={toMeetingDefaults(row)}
        submitLabel={tCommon("action.save")}
      />
    </RouteDrawer>
  );
}
