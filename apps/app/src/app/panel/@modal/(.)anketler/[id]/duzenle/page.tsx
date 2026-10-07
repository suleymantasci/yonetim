import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { pollListResponse } from "@yonetim/contracts";
import { Alert } from "@yonetim/ui";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toPollDefaults } from "../../../../anketler/poll-defaults";
import { PollDrawerFlow } from "../../poll-drawer-flow";

export const dynamic = "force-dynamic";

/** `/panel/anketler/[id]/duzenle` — çekmece sürümü. */
export default async function EditPollModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("poll:write");
  const t = await getTranslations("app.polls");
  const tCommon = await getTranslations("common");

  const { rows } = await apiGet(
    "/v1/panel/communication/polls",
    pollListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  return (
    <RouteDrawer
      title={row.question}
      description={t("editPollDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      {row.closedAt ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <Alert tone="warning">{t("closedCannotEdit")}</Alert>
        </div>
      ) : (
        <PollDrawerFlow
          defaults={toPollDefaults(row)}
          submitLabel={tCommon("action.save")}
        />
      )}
    </RouteDrawer>
  );
}
