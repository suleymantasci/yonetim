import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { staffDetail } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { toStaffDefaults } from "../../../../personel/staff-defaults";
import { EditStaffFlow } from "./edit-staff-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/personel/[id]/duzenle` — çekmece sürümü.
 *
 * Adrese doğrudan gidildiğinde kesme devreye girmez ve tam sayfa form açılır;
 * bu yüzden veri/yetki mantığı iki dosyada da aynı ve tam sayfa sürüm
 * silinmedi. Ortak olan kısım (`toStaffDefaults`) tek dosyada.
 */
export default async function EditStaffModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("staff:write");
  const t = await getTranslations("app.staff");
  const tCommon = await getTranslations("common");

  const detail = await apiGet(`/v1/panel/staff/${id}`, staffDetail).catch(
    () => null,
  );
  if (!detail) notFound();

  return (
    <RouteDrawer
      title={t("editStaff", { name: detail.fullName })}
      description={t("editStaffDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <EditStaffFlow
        defaults={toStaffDefaults(detail)}
        submitLabel={tCommon("action.save")}
      />
    </RouteDrawer>
  );
}
