import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { getBlockOptions } from "@/lib/queries/units";
import { BlocksManager } from "./blocks-manager";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.units");
  const blocks = await getBlockOptions(ctx);

  return (
    <>
      <PageHeader
        title={t("manageBlocks")}
        description={t("manageBlocksDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/birimler" }, { label: t("manageBlocks") }]}
      />
      <BlocksManager blocks={blocks} />
    </>
  );
}
