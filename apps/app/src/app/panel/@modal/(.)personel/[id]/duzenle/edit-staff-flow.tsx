"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { StaffForm, type StaffFormDefaults } from "../../../../personel/staff-form";

/**
 * Çekmece içindeki personel **düzenleme** akışı.
 *
 * Ekleme çekmecesinin aksine ikinci adım yok: düzenleme bitince yapılabilecek
 * tek anlamlı şey listeye dönmek. Kayıt başarılı olunca çekmece kapanıyor,
 * başarı bildirimi `ActionForm`'un toast'ından geliyor ve arkadaki liste
 * tazelendiği için değişiklik anında görünüyor.
 */
export function EditStaffFlow({
  defaults,
  submitLabel,
}: {
  defaults: StaffFormDefaults;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <StaffForm
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
