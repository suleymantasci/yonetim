"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import {
  MeetingForm,
  type MeetingFormDefaults,
} from "../../toplantilar/meeting-form";

/**
 * Çekmece içindeki toplantı ekleme/düzenleme akışı.
 *
 * Karar ekleme burada **yok**: tutanağa karar girmek uzun bir iş ve dar bir
 * çekmecede yapılacak bir şey değil; tam sayfa düzenleme ekranında yan
 * kartta duruyor.
 */
export function MeetingDrawerFlow({
  defaults,
  submitLabel,
}: {
  defaults?: MeetingFormDefaults;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <MeetingForm
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
