import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { blockListResponse } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export const dynamic = "force-dynamic";

export default async function NewUnitPage() {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const { rows: blocks } = await apiGet(
    "/v1/panel/units/bloklar",
    blockListResponse,
  );

  return (
    <>
      <PageHeader
        title={t("newUnit")}
        description={t("newUnitDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/birimler" },
          { label: t("newUnit") },
        ]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <UnitForm
            action={createUnit}
            blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
            cancelHref="/panel/birimler"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
