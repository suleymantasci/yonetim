import { getTranslations } from "next-intl/server";

import { blockListResponse, debtTypeList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { NoticeComposer } from "./notice-composer";

export const dynamic = "force-dynamic";

/**
 * Toplu bildirim — metin, borç durumu, maliklere kiracı borcu, giriş bilgisi.
 * Uygulama içi ve e-posta; SMS/WhatsApp entegrasyonlar açılınca.
 */
export default async function BulkNoticePage() {
  await requirePermission("announcement:write");
  const t = await getTranslations("app.bulkNotice");
  const [{ rows: blocks }, types] = await Promise.all([
    apiGet("/v1/panel/units/blocks", blockListResponse),
    apiGet("/v1/panel/debt-types", debtTypeList).catch(() => ({ rows: [] as { id: string; name: string }[] })),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <NoticeComposer
        blocks={blocks.map((b) => ({ id: b.id, name: b.name }))}
        debtTypes={types.rows.map((d) => ({ id: d.id, name: d.name }))}
      />
    </>
  );
}
