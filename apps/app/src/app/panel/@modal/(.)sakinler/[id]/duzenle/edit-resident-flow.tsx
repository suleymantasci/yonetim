"use client";

import type { ServerAction } from "@/components/form/action-form";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { ResidentForm } from "../../../../sakinler/resident-form";

/**
 * Çekmece içindeki sakin **düzenleme** akışı — UI Faz 2.5.
 *
 * Ekleme çekmecesinin aksine ikinci bir adım yok: düzenleme bitince
 * yapılabilecek tek anlamlı şey listeye dönmek. Bu yüzden kayıt başarılı
 * olduğunda çekmece kendiliğinden kapanıyor (`onSaved`), başarı bildirimi
 * `ActionForm`'un toast'undan geliyor ve arkadaki liste `router.refresh()` ile
 * tazelendiği için değişiklik anında görünüyor.
 *
 * `stayOnSuccess`: `updateResident` "detay sayfasına git" diyor. Kullanıcı
 * listeden bir satırı düzeltmek için geldiyse onu detaya atmak, geldiği yeri
 * kaybettirir. Yönlendirme kararı sunucuda kalıyor, **izlememe** kararı
 * burada — adrese doğrudan gidildiğinde tam sayfa sürüm hâlâ detaya götürüyor.
 */
export function EditResidentFlow({
  action,
  units,
  defaults,
  submitLabel,
}: {
  action: ServerAction<{ id: string }>;
  units: { id: string; number: string; blockName: string | null }[];
  defaults: React.ComponentProps<typeof ResidentForm>["defaults"];
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <ResidentForm
      action={action}
      units={units}
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
