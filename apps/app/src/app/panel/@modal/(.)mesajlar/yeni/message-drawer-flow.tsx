"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { MessageForm } from "../../../mesajlar/message-form";

/**
 * Çekmece içindeki mesaj gönderme akışı.
 *
 * Gönderim sonrası çekmece **kapanmıyor**: mesaj engellenmiş olabilir
 * (servis penceresi kapalı, numara yok) ve o bilgi formun üstündeki
 * bildirimde duruyor. Kapatmak, yöneticiye mesajın gittiğini sanmasına yol
 * açardı — bu ekranın verebileceği en pahalı yanlış bilgi.
 */
export function MessageDrawerFlow({
  residents,
  submitLabel,
}: {
  residents: { id: string; name: string }[];
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <MessageForm
      residents={residents}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
    />
  );
}
