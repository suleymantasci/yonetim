import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { createUnit } from "../actions";
import { UnitForm } from "../unit-form";

export const dynamic = "force-dynamic";

export default async function NewUnitPage() {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const blocks = await getBlockOptions(ctx);

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
