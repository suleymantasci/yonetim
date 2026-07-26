import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import type { SearchParamsInput } from "@/lib/list-params";
import { getUnitOptions } from "@/lib/queries/units";
import { createResident } from "../actions";
import { ResidentForm } from "../resident-form";

export const dynamic = "force-dynamic";

export default async function NewResidentPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const ctx = await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");
  const query = await searchParams;

  const units = await getUnitOptions(ctx);
  // Birim detayından "sakin ata" ile gelindiğinde birim ön seçili olur.
  const presetUnitRaw = Array.isArray(query.birim) ? query.birim[0] : query.birim;
  const presetUnitId = units.some((unit) => unit.id === presetUnitRaw) ? presetUnitRaw : undefined;

  return (
    <>
      <PageHeader
        title={t("newResident")}
        description={t("newResidentDescription")}
        breadcrumb={[{ label: t("title"), href: "/panel/sakinler" }, { label: t("newResident") }]}
      />
      <Card className="max-w-3xl">
        <CardBody>
          <ResidentForm
            action={createResident}
            units={units.map((unit) => ({
              id: unit.id,
              number: unit.number,
              blockName: unit.blockName,
            }))}
            presetUnitId={presetUnitId}
            cancelHref="/panel/sakinler"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
