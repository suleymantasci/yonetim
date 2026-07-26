import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { BulkUnitForm } from "./bulk-form";

export const dynamic = "force-dynamic";

export default async function BulkUnitsPage() {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const blocks = await getBlockOptions(ctx);

  return (
    <>
      <PageHeader
        title={t("bulkWizard")}
        description={t("bulkWizardDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/birimler" }, { label: t("bulkWizard") }]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <BulkUnitForm
            blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
            cancelHref="/panel/birimler"
          />
        </CardBody>
      </Card>
    </>
  );
}
