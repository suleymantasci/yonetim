import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { MeetingForm } from "../meeting-form";

export const dynamic = "force-dynamic";

/** `/panel/toplantilar/yeni` — tam sayfa (çekmece: `@modal/(.)toplantilar`). */
export default async function NewMeetingPage() {
  await requirePermission("meeting:write");
  const t = await getTranslations("app.meetings");
  const tCommon = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("newMeeting")}
        description={t("newMeetingDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/toplantilar" },
          { label: t("newMeeting") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <MeetingForm
            cancelHref="/panel/toplantilar"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
