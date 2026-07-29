"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { messageSendResult } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import {
  okState,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Tek kişiye mesaj gönderme köprüsü — PROJE-DURUMU §5.2, sıra 6.
 *
 * DUYURUDAN FARKI MUHATAP: duyuru kitleye, mesaj bir kişiye gider. Kanal
 * seçimi, WhatsApp servis penceresi kontrolü ve gönderim `apps/api`'de;
 * burada yalnız doğrulama ve HTTP var.
 */

const CHANNELS = ["whatsapp", "sms", "in_app"] as const;

const messageSchema = z.object({
  userId: uuidField,
  channel: z.enum(CHANNELS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  body: requiredText(1, 4000),
});

export async function sendMessage(
  _previous: ActionState<{ channel: string; blockedReason: string | null }>,
  formData: FormData,
): Promise<ActionState<{ channel: string; blockedReason: string | null }>> {
  return runAction(
    {
      permission: "message:write",
      schema: messageSchema,
      meta: { action: "message_sent", resource: "message" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.messages");

      const result = await apiPost(
        "/v1/panel/communication/messages",
        {
          userId: input.userId,
          channel: input.channel,
          body: input.body,
        },
        messageSendResult,
      );

      revalidatePath("/panel/mesajlar");

      /*
       * Engellenen gönderim de **başarılı bir eylem**: kayıt açıldı ve
       * yönetici neden ulaşılamadığını görüyor. `ok: false` dönmek, sistemin
       * hata verdiği izlenimini yaratırdı — oysa sistem doğru çalıştı ve
       * gönderemeyeceğini söyledi.
       */
      const message = result.queued
        ? t("sent", { channel: result.channel })
        : t(`blocked.${result.blockedReason ?? "send_failed"}`);

      return okState(message, {
        data: {
          channel: result.channel,
          blockedReason: result.blockedReason,
        },
      });
    },
  );
}
