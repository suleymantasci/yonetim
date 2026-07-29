"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { ReservationDecisionForm } from "../../../../rezervasyon/decision-form";

/**
 * Çekmece içindeki karar akışı.
 *
 * Karar verilince çekmece kapanıyor: onaylanan bir talepte yapılacak başka
 * bir şey yok ve kullanıcı sıradaki talebe geçmek istiyor.
 */
export function ReservationDecisionFlow({
  reservationId,
  currentStatus,
  submitLabel,
}: {
  reservationId: string;
  currentStatus: string;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <div className="p-5 sm:p-6">
      <ReservationDecisionForm
        reservationId={reservationId}
        currentStatus={currentStatus}
        submitLabel={submitLabel}
        onDone={close}
      />
    </div>
  );
}
