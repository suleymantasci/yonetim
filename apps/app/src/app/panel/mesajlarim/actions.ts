"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import { okState, requiredText, runAction, type ActionState } from "@/lib/form";

/**
 * Sakinin yönetime mesajı.
 *
 * Yönetimin `sendMessage` eylemi alıcı seçtiriyor ve WhatsApp servis
 * penceresini kolluyor; sakinin alıcısı tek ve sabit (yönetim), kanal da
 * uygulama içi. Bu yüzden ayrı ve çok daha küçük bir eylem.
 */
const schema = z.object({ body: requiredText(1, 2000) });

export async function sendMessageToManagement(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "message:write",
      schema,
      meta: { action: "portal_message_sent", resource: "message" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myMessages");

      const result = await apiPost(
        "/v1/panel/portal/messages",
        { body: input.body },
        z.object({ id: z.string().uuid() }),
      );

      revalidatePath("/panel/mesajlarim");
      return okState(t("sent"), { data: { id: result.id } });
    },
  );
}
