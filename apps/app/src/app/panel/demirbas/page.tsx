import { getTranslations } from "next-intl/server";

import { inventoryListResponse } from "@yonetim/contracts";
import { Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { InventoryManager, type InventoryRowView } from "./inventory-manager";

export const dynamic = "force-dynamic";

/** Durum → rozet tonu. Kayıp ayrı bir ton: hesabı sorulacak tek durum bu. */
const STATUS_TONE = {
  active: "success",
  in_repair: "warning",
  broken: "warning",
  disposed: "neutral",
  lost: "danger",
} as const;

/**
 * Demirbaş defteri — KMK md.34/9, rakip incelemesi §4.1.
 *
 * Yönetici ortak yer eşyasını korumak ve devir teslimde hesabını vermekle
 * yükümlü; bu liste o hesabın kaynağı. Sayaçlar sunucuda (§9a): "garantisi
 * doldu mu" bir zaman karşılaştırması ve ölçütü sunucunun saati olmalı.
 */
export default async function InventoryPage() {
  await requirePermission("inventory:read");
  const t = await getTranslations("app.inventory");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const data = await apiGet("/v1/panel/inventory", inventoryListResponse);

  const rows: InventoryRowView[] = data.rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    categoryLabel: tEnum(`inventoryCategory.${row.category}`),
    location: row.location,
    quantity: row.quantity,
    serialNo: row.serialNo,
    purchaseDate: row.purchaseDate ? fmt.date(row.purchaseDate) : null,
    // Forma `<input type="date">` biçiminde geri verilecek ham değer; ekranda
    // gösterilen yerelleştirilmiş metin form alanına yazılamaz.
    purchaseDateValue: row.purchaseDate ? isoDay(row.purchaseDate) : null,
    purchasePriceKurus: row.purchasePriceKurus,
    purchasePrice:
      row.purchasePriceKurus > 0 ? fmt.money(row.purchasePriceKurus) : "—",
    warrantyUntil: row.warrantyUntil ? fmt.date(row.warrantyUntil) : null,
    warrantyUntilValue: row.warrantyUntil ? isoDay(row.warrantyUntil) : null,
    warrantyExpired: row.warrantyExpired,
    status: row.status,
    statusLabel: tEnum(`inventoryStatus.${row.status}`),
    statusTone:
      STATUS_TONE[row.status as keyof typeof STATUS_TONE] ?? "neutral",
    responsibleStaffId: row.responsibleStaffId,
    responsibleStaffName: row.responsibleStaffName,
    notes: row.notes,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={t("statItems")}
          value={String(data.totals.items)}
          hint={t("statItemsHint", { units: data.totals.units })}
        />
        <Stat
          label={t("statValue")}
          value={fmt.money(data.totals.valueMinor)}
          hint={t("statValueHint")}
        />
        <Stat
          label={t("statNeedsAttention")}
          value={String(data.totals.needsAttention)}
          tone={data.totals.needsAttention > 0 ? "warning" : "success"}
        />
        {/* Kayıp ayrı sayaç: devir teslimde sorulan tek soru bu ve
            "ilgilenilmesi gerekenler" içinde eriyip gitmemeli. */}
        <Stat
          label={t("statLost")}
          value={String(data.totals.lost)}
          tone={data.totals.lost > 0 ? "danger" : "success"}
          hint={t("statLostHint")}
        />
      </div>

      <InventoryManager
        rows={rows}
        staffOptions={data.staffOptions}
        emptyLabel={tCommon("state.empty")}
      />
    </>
  );
}

/** `Date` → `YYYY-MM-DD`; `<input type="date">` yalnız bu biçimi kabul eder. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}
