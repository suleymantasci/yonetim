import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { lawyerList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { LawyerManager } from "./lawyer-manager";

export const dynamic = "force-dynamic";

/** Avukat tanımları — icra dosyaları avukata atanır, liste avukata göre süzülür. */
export default async function LawyersPage() {
  const ctx = await requirePermission("legal:read");
  const t = await getTranslations("app.legal");
  const f = await formatters();
  const { rows } = await apiGet("/v1/panel/legal/lawyers", lawyerList);
  return (
    <>
      <PageHeader
        title={t("lawyersTitle")}
        description={t("lawyersDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/hukuk" }, { label: t("lawyersTitle") }]}
      />
      <LawyerManager
        rows={rows.map((r) => ({ ...r, collected: f.money(r.collectedMinor) }))}
        canWrite={hasPermission(ctx.roles, "legal:write")}
      />
    </>
  );
}
