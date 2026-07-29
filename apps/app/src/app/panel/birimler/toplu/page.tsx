import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { blockListResponse } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BulkUnitForm } from "./bulk-form";

export const dynamic = "force-dynamic";

export default async function BulkUnitsPage() {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const { rows: blocks } = await apiGet(
    "/v1/panel/units/blocks",
    blockListResponse,
  );

  return (
    <>
      <PageHeader
        title={t("bulkWizard")}
        description={t("bulkWizardDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/birimler" },
          { label: t("bulkWizard") },
        ]}
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
