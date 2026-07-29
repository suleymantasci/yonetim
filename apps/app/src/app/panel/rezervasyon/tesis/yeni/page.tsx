import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { ResourceForm } from "../../resource-form";

export const dynamic = "force-dynamic";

/** `/panel/rezervasyon/tesis/yeni` — tam sayfa (çekmece: `@modal`). */
export default async function NewResourcePage() {
  await requirePermission("reservation:write");
  const t = await getTranslations("app.reservations");
  const tCommon = await getTranslations("common");

  return (
    <>
      <PageHeader
        title={t("newResource")}
        description={t("newResourceDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/rezervasyon" },
          { label: t("newResource") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <ResourceForm
            cancelHref="/panel/rezervasyon"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
