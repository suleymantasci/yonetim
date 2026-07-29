import { getTranslations } from "next-intl/server";

import { unitOptionList } from "@yonetim/contracts";
import { addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import type { SearchParamsInput } from "@/lib/list-params";
import { NewDebtFlow } from "./new-debt-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/borclar/yeni` — çekmece sürümü.
 *
 * Komut paletindeki "Yeni borç girişi" hızlı işlemi ve borç listesindeki
 * ekleme düğmesi bu adrese gidiyor; bugüne kadar ikisi de tam sayfaya
 * atlıyor ve filtrelenmiş listeyi kaybettiriyordu.
 *
 * `?birim=` ön seçimi tam sayfa sürümüyle aynı: birim detayından gelen
 * "bu daireye borç yaz" bağlantısı da aynı adresi kullanıyor.
 */
export default async function NewDebtModal({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const tCommon = await getTranslations("common");
  const query = await searchParams;

  const units = await apiGet("/v1/panel/units/options", unitOptionList);
  const presetRaw = Array.isArray(query.birim) ? query.birim[0] : query.birim;
  const presetUnitId = units.some((unit) => unit.id === presetRaw)
    ? presetRaw
    : undefined;

  return (
    <RouteDrawer
      title={t("newDebt")}
      description={t("newDebtDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewDebtFlow
        units={units.map((unit) => ({
          id: unit.id,
          number: unit.number,
          blockName: unit.blockName,
        }))}
        presetUnitId={presetUnitId}
        defaultPeriod={periodKey(addMonths(currentPeriod(), 0))}
        labels={{
          createdTitle: t("drawerCreatedTitle"),
          createdHint: t("drawerCreatedHint"),
          addAnother: t("drawerAddAnother"),
          openDetail: tCommon("action.detail"),
          done: tCommon("action.close"),
        }}
      />
    </RouteDrawer>
  );
}
