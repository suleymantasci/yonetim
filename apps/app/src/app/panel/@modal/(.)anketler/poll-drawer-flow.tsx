"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { PollForm, type PollFormDefaults } from "../../anketler/poll-form";

/**
 * Çekmece içindeki anket ekleme/düzenleme akışı.
 *
 * "Bir tane daha" adımı yok: anket arka arkaya açılan bir kayıt değil,
 * her biri ayrı bir gündem maddesi. Kayıt bitince çekmece kapanıyor.
 */
export function PollDrawerFlow({
  defaults,
  submitLabel,
}: {
  defaults?: PollFormDefaults;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <PollForm
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
