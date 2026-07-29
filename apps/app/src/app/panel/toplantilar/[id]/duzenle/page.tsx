import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { meetingListResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { MeetingDecisionForm } from "../../decision-form";
import { toMeetingDefaults } from "../../meeting-defaults";
import { MeetingForm } from "../../meeting-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/toplantilar/[id]/duzenle` — tam sayfa (çekmece: `@modal`).
 *
 * Tutanağa karar ekleme aynı sayfada ikinci kart olarak duruyor: toplantı
 * yapıldıktan sonraki iş "durumu 'yapıldı' yap ve kararları gir" ve bu ikisi
 * tek oturumda yapılıyor.
 */
export default async function EditMeetingPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("meeting:write");
  const t = await getTranslations("app.meetings");
  const tCommon = await getTranslations("common");

  const { rows } = await apiGet(
    "/v1/panel/communication/meetings",
    meetingListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  return (
    <>
      <PageHeader
        title={row.title}
        description={t("editMeetingDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/toplantilar" },
          { label: row.title },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("editSection")} />
          <CardBody>
            <MeetingForm
              defaults={toMeetingDefaults(row)}
              cancelHref="/panel/toplantilar"
              submitLabel={tCommon("action.save")}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("decisionsSection")}
            description={t("decisionsSectionHint", {
              count: row.decisions.length,
            })}
          />
          <CardBody>
            <MeetingDecisionForm
              meetingId={row.id}
              submitLabel={t("addDecision")}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
