"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import {
  ResourceForm,
  type ResourceFormDefaults,
} from "../../../rezervasyon/resource-form";

/**
 * Çekmece içindeki tesis tanımlama/düzenleme akışı.
 *
 * Ekleme ve düzenleme **aynı** bileşen: tesis tanımı arka arkaya yapılan bir
 * iş değil (bir sitede üç beş tesis olur), o yüzden "bir tane daha" adımı
 * yok. Kayıt bitince çekmece kapanıyor.
 */
export function ResourceDrawerFlow({
  defaults,
  submitLabel,
}: {
  defaults?: ResourceFormDefaults;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <ResourceForm
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
