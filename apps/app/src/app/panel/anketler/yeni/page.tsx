import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { PollForm } from "../poll-form";

export const dynamic = "force-dynamic";

/** `/panel/anketler/yeni` — tam sayfa (çekmece: `@modal/(.)anketler`). */
export default async function NewPollPage() {
  await requirePermission("poll:write");
  const t = await getTranslations("app.polls");
  const tCommon = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("newPoll")}
        description={t("newPollDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/anketler" },
          { label: t("newPoll") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <PollForm
            cancelHref="/panel/anketler"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
