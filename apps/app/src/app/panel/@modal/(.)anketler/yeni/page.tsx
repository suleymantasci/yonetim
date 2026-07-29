import { getTranslations } from "next-intl/server";

import { RouteDrawer } from "@/components/route-drawer";
import { requirePermission } from "@/lib/context";
import { PollDrawerFlow } from "../poll-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/anketler/yeni` — çekmece sürümü. */
export default async function NewPollModal() {
  await requirePermission("poll:write");
  const t = await getTranslations("app.polls");
  const tCommon = await getTranslations("common");

  return (
    <RouteDrawer
      title={t("newPoll")}
      description={t("newPollDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <PollDrawerFlow submitLabel={tCommon("action.create")} />
    </RouteDrawer>
  );
}
