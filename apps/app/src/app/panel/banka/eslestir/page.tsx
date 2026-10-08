import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { bankQueueResponse, categoryTree, unitOptionList, type CategoryTree } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { getVendorOptions } from "@/lib/vendor-options";
import { MatchQueue } from "./match-queue";

export const dynamic = "force-dynamic";

type Node = CategoryTree["roots"][number];

/** Kategori ağacını seçim listesine düzleştir (pasifler hariç). */
function flatten(nodes: Node[], out: Array<{ id: string; name: string; depth: number }> = []) {
  for (const n of nodes) {
    if (!n.isActive) continue;
    out.push({ id: n.id, name: n.name, depth: n.depth });
    flatten(n.children, out);
  }
  return out;
}

/**
 * Eşleştirme kuyruğu — dökümden gelen, sonuçlanmamış hareketler.
 * Gelen: daire seç (öneri hazır) → tahsil et (tek tek ya da toplu).
 * Çıkan: kategori seç → ödenmiş gider olarak kaydet.
 */
export default async function MatchQueuePage() {
  const ctx = await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  const [queue, units, tree, vendors] = await Promise.all([
    apiGet("/v1/panel/bank/queue", bankQueueResponse),
    apiGet("/v1/panel/units/options", unitOptionList).catch(() => []),
    apiGet("/v1/panel/expenses/categories", categoryTree).catch(() => ({ roots: [] })),
    getVendorOptions(),
  ]);

  const serialize = (rows: typeof queue.incoming) =>
    rows.map((r) => ({ ...r, transactionAt: r.transactionAt.toISOString() }));

  return (
    <>
      <PageHeader
        title={t("queueTitle")}
        description={t("queueDescription")}
        action={
          <Link
            href="/panel/banka/aktar"
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
          >
            {t("importStatement")}
          </Link>
        }
      />
      <MatchQueue
        incoming={serialize(queue.incoming)}
        outgoing={serialize(queue.outgoing)}
        units={units
          .map((u) => ({ id: u.id, label: u.blockName ? `${u.blockName} / ${u.number}` : u.number }))
          .sort((a, b) => a.label.localeCompare(b.label, "tr", { numeric: true }))}
        categories={flatten(tree.roots)}
        vendors={vendors}
        canCollect={hasPermission(ctx.roles, "payment:create")}
        canExpense={hasPermission(ctx.roles, "expense:write")}
      />
    </>
  );
}
