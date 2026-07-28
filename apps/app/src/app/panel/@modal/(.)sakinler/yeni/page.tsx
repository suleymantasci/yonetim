import { getTranslations } from "next-intl/server";

import { unitOptionList } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import type { SearchParamsInput } from "@/lib/list-params";
import { createResident } from "../../../sakinler/actions";
import { NewResidentFlow } from "./new-resident-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/sakinler/yeni` — çekmece sürümü.
 *
 * `?birim=` ön seçimi tam sayfa sürümüyle aynı: birim çekmecesinden gelen
 * "bu birime sakin ekle" bağlantısı da, birim detayındaki "sakin ata"
 * düğmesi de aynı adresi kullanıyor.
 */
export default async function NewResidentModal({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");
  const query = await searchParams;

  const units = await apiGet("/v1/panel/units/secenekler", unitOptionList);
  const presetUnitRaw = Array.isArray(query.birim) ? query.birim[0] : query.birim;
  const presetUnitId = units.some((unit) => unit.id === presetUnitRaw)
    ? presetUnitRaw
    : undefined;

  return (
    <RouteDrawer
      title={t("newResident")}
      description={t("newResidentDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <NewResidentFlow
        action={createResident}
        units={units.map((unit) => ({
          id: unit.id,
          number: unit.number,
          blockName: unit.blockName,
        }))}
        presetUnitId={presetUnitId}
        labels={{
          submit: tCommon("action.create"),
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
