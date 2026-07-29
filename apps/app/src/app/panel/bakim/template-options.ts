import { getTranslations } from "next-intl/server";

import type { MaintenanceListResponse } from "@yonetim/contracts";

import type { MaintenanceTemplateOption } from "./maintenance-form";

/**
 * Yasal şablon listesini **sunucuda çevirip** forma hazır hale getirir.
 *
 * NEDEN SUNUCUDA: `maintenance` namespace'i tüm mevzuat kütüphanesi (13 kB'ın
 * üzerinde) ve yalnız bu formun `<select>`'inde kullanılıyor. İstemciye
 * göndermek, tek bir açılır liste için tüm metni her sayfa yüklemesine
 * eklemek olurdu. `tests/i18n-client.test.ts` bu kuralı zaten bekliyor:
 * sağlayıcıya konmayan namespace istemcide sessizce anahtar basar.
 *
 * Tek dosya, çünkü üç çağıran var: `bakim/yeni`, `bakim/[id]/duzenle` ve
 * ikisinin çekmece sürümleri.
 */
export async function toTemplateOptions(
  templates: MaintenanceListResponse["templates"],
): Promise<MaintenanceTemplateOption[]> {
  const tLib = await getTranslations("maintenance");

  return templates.map((tpl) => ({
    id: tpl.id,
    code: tpl.code,
    // Çeviri yoksa API'nin verdiği ada düşülüyor: site kendi şablonunu
    // tanımladıysa (`templatesAreSeed: false`) o adın karşılığı sözlükte yok.
    name: tLib.has(`template.${tpl.code}.name`)
      ? tLib(`template.${tpl.code}.name`)
      : tpl.name,
    equipmentType: tpl.equipmentType,
    intervalDays: tpl.intervalDays,
    isMandatory: tpl.isMandatory,
    regulatoryNote: tLib.has(`template.${tpl.code}.ref`)
      ? tLib(`template.${tpl.code}.ref`)
      : tpl.regulatoryRef,
  }));
}
