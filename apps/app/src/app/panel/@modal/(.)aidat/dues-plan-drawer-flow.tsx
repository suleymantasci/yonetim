"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { DuesPlanForm } from "../../aidat/plan-form";

/**
 * Çekmece içindeki aidat planı ekleme/düzenleme akışı.
 *
 * "Bir tane daha" adımı yok: bir sitede birkaç aidat planı olur ve her biri
 * ayrı bir karar. Kayıt bitince çekmece kapanıyor.
 */
export function DuesPlanDrawerFlow({
  blocks,
  defaults,
  defaultStartPeriod,
  submitLabel,
}: {
  blocks: { id: string; name: string }[];
  defaults?: React.ComponentProps<typeof DuesPlanForm>["defaults"];
  defaultStartPeriod: string;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <DuesPlanForm
      blocks={blocks}
      defaults={defaults}
      defaultStartPeriod={defaultStartPeriod}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
