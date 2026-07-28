import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { residentEditForm, unitOptionList } from "@yonetim/contracts";

import { RouteDrawer } from "@/components/route-drawer";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { updateResident } from "../../../../sakinler/actions";
import { EditResidentFlow } from "./edit-resident-flow";

export const dynamic = "force-dynamic";

/**
 * `/panel/sakinler/[id]/duzenle` — çekmece sürümü.
 *
 * Listedeki kalem ikonu ve detaydaki "Düzenle" düğmesi artık sayfa
 * değiştirmiyor: aynı adres, aynı `page.tsx` mantığı, farklı kabuk. Ekleme
 * çekmece iken düzenlemenin tam sayfa açılması akışın ortasında ritim
 * değiştiriyordu — filtrelenmiş listede üç kaydı arka arkaya düzeltmek üç kez
 * "listeye geri dön" demekti.
 *
 * Adrese doğrudan gidildiğinde (yeni sekme, paylaşılan bağlantı, yenileme)
 * kesme devreye girmez ve tam sayfa form açılır; bu yüzden veri/yetki mantığı
 * iki dosyada da aynı ve `sakinler/[id]/duzenle/page.tsx` silinmedi.
 */
export default async function EditResidentModal({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");

  // Ham telefonu yalnız bu uç döndürüyor (`resident:write` + ayrı KVKK kaydı):
  // maskeli değer forma yazılsaydı kaydetmek numarayı maskeyle ezerdi.
  const [detail, units] = await Promise.all([
    apiGet(`/v1/panel/residents/${id}/duzenle`, residentEditForm).catch(() => null),
    apiGet("/v1/panel/units/secenekler", unitOptionList),
  ]);
  if (!detail) notFound();

  const name =
    [detail.firstName, detail.lastName].filter(Boolean).join(" ") || t("unnamed");

  return (
    <RouteDrawer
      title={t("editResident", { name })}
      description={t("editResidentDescription")}
      closeLabel={tCommon("action.close")}
      size="xl"
    >
      <EditResidentFlow
        action={updateResident}
        units={units.map((unit) => ({
          id: unit.id,
          number: unit.number,
          blockName: unit.blockName,
        }))}
        submitLabel={tCommon("action.save")}
        defaults={{
          id: detail.id,
          firstName: detail.firstName,
          lastName: detail.lastName,
          phone: detail.phone,
          email: detail.email,
          role: detail.role,
          locale: detail.locale,
          whatsappOptIn: detail.whatsappOptIn,
          emergencyContactName: detail.emergencyContactName,
          emergencyContactPhone: detail.emergencyContactPhone,
          bloodType: detail.bloodType,
          hasHealthConsent: detail.hasHealthConsent,
          notes: detail.notes,
          hasTckn: detail.hasTckn,
        }}
      />
    </RouteDrawer>
  );
}
