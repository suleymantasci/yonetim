import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { VendorImporter } from "./vendor-importer";

export const dynamic = "force-dynamic";

/**
 * Okuma firması dosyasıyla borçlandırma — firmanın sayaç başı hesapladığı
 * tutarlar (Excel/CSV). Firma API'si değil; dosya.
 */
export default async function VendorFilePage() {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meterVendor");
  const tMeters = await getTranslations("app.meters");
  const today = new Date(Date.now() + 3 * 3_600_000);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tMeters("title"), href: "/panel/sayaclar" }, { label: t("title") }]}
      />
      <VendorImporter defaultPeriod={today.toISOString().slice(0, 7)} />
    </>
  );
}
