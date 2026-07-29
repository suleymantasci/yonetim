import { getTranslations } from "next-intl/server";

import { unitOptionList } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { MeterForm } from "../meter-form";

export const dynamic = "force-dynamic";

/** `/panel/sayaclar/yeni` — tam sayfa sürüm (çekmece: `@modal/(.)sayaclar`). */
export default async function NewMeterPage() {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");
  const tCommon = await getTranslations("common");

  // Ortak combobox ucu (`unit:read`). Talep listesindeki daire dizisini
  // kullanmak cazipti ama o uç `request:read` istiyor: sayaç tanımlayan bir
  // kullanıcının talepleri görme yetkisi olmak zorunda değil.
  const units = await apiGet("/v1/panel/units/secenekler", unitOptionList);

  return (
    <>
      <PageHeader
        title={t("newMeter")}
        description={t("newMeterDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/sayaclar" },
          { label: t("newMeter") },
        ]}
      />

      <Card className="max-w-3xl">
        <CardBody>
          <MeterForm
            units={units.map((u) => ({
              id: u.id,
              number: u.number,
              blockName: u.blockName,
            }))}
            cancelHref="/panel/sayaclar"
            submitLabel={tCommon("action.create")}
          />
        </CardBody>
      </Card>
    </>
  );
}
