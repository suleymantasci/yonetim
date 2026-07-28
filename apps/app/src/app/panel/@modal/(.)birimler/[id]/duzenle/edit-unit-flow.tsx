"use client";

import type { ServerAction } from "@/components/form/action-form";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { UnitForm } from "../../../../birimler/unit-form";

/**
 * Çekmece içindeki bağımsız bölüm **düzenleme** akışı — UI Faz 2.5.
 *
 * Gerekçesi `EditResidentFlow` ile aynı: kayıt bitince çekmece kapanır,
 * `updateUnit`'in detay sayfasına yönlendirmesi çekmece bağlamında izlenmez
 * (`stayOnSuccess`), liste `router.refresh()` ile tazelenir.
 */
export function EditUnitFlow({
  action,
  blocks,
  defaults,
  submitLabel,
}: {
  action: ServerAction<{ id: string }>;
  blocks: { id: string; name: string }[];
  defaults: React.ComponentProps<typeof UnitForm>["defaults"];
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <UnitForm
      action={action}
      blocks={blocks}
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
