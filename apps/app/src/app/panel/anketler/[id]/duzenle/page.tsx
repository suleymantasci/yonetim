import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { pollListResponse } from "@yonetim/contracts";
import { Alert, Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toPollDefaults } from "../../poll-defaults";
import { PollForm } from "../../poll-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/anketler/[id]/duzenle` — tam sayfa (çekmece: `@modal`).
 *
 * Ayrı bir detay ucu yok: liste yanıtı zaten formun ihtiyaç duyduğu her alanı
 * taşıyor. Tek kayıt için ikinci bir uç açmak, aynı veriyi iki yerde
 * biçimlendirmek olurdu.
 */
export default async function EditPollPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("poll:write");
  const t = await getTranslations("app.polls");
  const tCommon = await getTranslations("common");

  const { rows } = await apiGet(
    "/v1/panel/communication/anketler",
    pollListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  return (
    <>
      <PageHeader
        title={row.question}
        description={t("editPollDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/anketler" },
          { label: t("editPoll") },
        ]}
      />

      {row.closedAt ? (
        <div className="mb-4 max-w-3xl">
          <Alert tone="warning">{t("closedCannotEdit")}</Alert>
        </div>
      ) : (
        <Card className="max-w-3xl">
          <CardBody>
            <PollForm
              defaults={toPollDefaults(row)}
              cancelHref="/panel/anketler"
              submitLabel={tCommon("action.save")}
            />
          </CardBody>
        </Card>
      )}
    </>
  );
}
