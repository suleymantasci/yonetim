import { getTranslations } from "next-intl/server";

import { residentOptionList } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { MessageForm } from "../message-form";

export const dynamic = "force-dynamic";

/** `/panel/mesajlar/yeni` — tam sayfa (çekmece: `@modal/(.)mesajlar`). */
export default async function NewMessagePage() {
  await requirePermission("message:write");
  const t = await getTranslations("app.messages");

  const residents = await apiGet(
    "/v1/panel/residents/options",
    residentOptionList,
  );

  return (
    <>
      <PageHeader
        title={t("newMessage")}
        description={t("newMessageDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/mesajlar" },
          { label: t("newMessage") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <MessageForm
            residents={residents.rows.map((r) => ({
              id: r.id,
              name:
                [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
                (r.phoneMasked ?? "—"),
            }))}
            submitLabel={t("send")}
          />
        </CardBody>
      </Card>
    </>
  );
}
