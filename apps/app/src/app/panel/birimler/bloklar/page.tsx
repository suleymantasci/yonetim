import { getTranslations } from "next-intl/server";

import { blockListResponse } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { BlocksManager } from "./blocks-manager";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const { rows: blocks } = await apiGet(
    "/v1/panel/units/bloklar",
    blockListResponse,
  );

  return (
    <>
      <PageHeader
        title={t("manageBlocks")}
        description={t("manageBlocksDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/birimler" },
          { label: t("manageBlocks") },
        ]}
      />
      <BlocksManager blocks={blocks} />
    </>
  );
}
