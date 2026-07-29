"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPatch } from "@/lib/api/server";
import {
  emailField,
  okState,
  optionalText,
  phoneField,
  requiredText,
  runAction,
  type ActionState,
} from "@/lib/form";

/**
 * "Bilgilerim" güncelleme.
 *
 * TELEFON BU FORMDA YOK ve bilinçli: numara oturum kimliğinin kendisi (giriş
 * kodu oraya gidiyor). Doğrulamasız değiştirilebilseydi hesabı başka bir
 * numaraya taşımak, yani devralmak mümkün olurdu. Numara değişikliği ayrı bir
 * doğrulama akışı gerektiriyor (PROJE-DURUMU §5.8 "sırada").
 */
const schema = z.object({
  firstName: requiredText(1, 80),
  lastName: requiredText(1, 80),
  email: emailField,
  emergencyContactName: optionalText(120),
  // Acil durumda **aranacak** numara: biçim doğrulaması burada da geçerli,
  // yanlış yazılmış bir numara tam da gerektiği anda işe yaramaz.
  emergencyContactPhone: phoneField,
});

export async function updateMyProfile(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "unit:read",
      schema,
      meta: { action: "portal_profile_updated", resource: "user" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myProfile");

      await apiPatch(
        "/v1/panel/portal/profile",
        {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        },
        z.object({ ok: z.literal(true) }),
      );

      revalidatePath("/panel/bilgilerim");
      return okState(t("saved"));
    },
  );
}
