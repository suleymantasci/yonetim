import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { requestDetail, requestListResponse } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { RequestDrawerFlow } from "./request-drawer-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/talepler/[id]` — çekmece sürümü.
 *
 * Talep ekranı akış-içi çalışmanın en tipik yeri: yönetici filtrelenmiş bir
 * listede sırayla talepleri açıp durum değiştiriyor. Her biri için tam
 * sayfaya gidip geri dönmek, filtreyi ve kaydırma konumunu her seferinde
 * kaybettirirdi.
 */
export default async function RequestDetailModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("request:read");
  const t = await getTranslations("app.requests");
  const tCommon = await getTranslations("common");

  const [detail, options] = await Promise.all([
    apiGet(`/v1/panel/operations/talepler/${id}`, requestDetail).catch(
      () => null,
    ),
    apiGet("/v1/panel/operations/talepler", requestListResponse),
  ]);
  if (!detail) notFound();

  return (
    <RouteDrawer
      title={`${detail.code} — ${detail.title}`}
      description={t("detailDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <RequestDrawerFlow
        detail={detail}
        assignees={options.assignees}
        canWrite={hasPermission(ctx.roles, "request:write")}
        canAssign={hasPermission(ctx.roles, "request:assign")}
      />
    </RouteDrawer>
  );
}
