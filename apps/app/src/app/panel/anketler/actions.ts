"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { pollCloseResult, pollSaveResult } from "@yonetim/contracts";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  dateField,
  errorState,
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Anket/oylama yazma köprüsü — PROJE-DURUMU §5.2, sıra 6.
 *
 * Seçenek kimlikleri, sonuç hesabı ve yeter sayı kuralları `apps/api`'de.
 * Burada yalnız doğrulama ve HTTP var.
 */

const WEIGHT_MODES = ["equal", "land_share"] as const;
const VISIBILITIES = ["open", "secret"] as const;
const QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;

const pollSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  question: requiredText(5, 500),
  description: optionalText(4000),
  weightMode: z.enum(WEIGHT_MODES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  quorumRule: z.enum(QUORUM_RULES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  visibility: z.enum(VISIBILITIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  allowMultiple: checkboxField,
  ownersOnly: checkboxField,
  opensAt: dateField,
  closesAt: dateField,
});

export async function savePoll(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  /*
   * Seçenekler dizi olarak geliyor (`option` adlı çoklu alan) ve şemanın
   * dışında ayrıştırılıyor: sayıları formda değişken ve boş satırlar
   * kullanıcının silmek istediği satırlar — sunucuya taşımanın anlamı yok.
   */
  const options = formData
    .getAll("option")
    .map((value) => String(value).trim())
    .filter((value) => value !== "");

  return runAction(
    {
      permission: "poll:write",
      schema: pollSchema,
      meta: { action: "poll_saved", resource: "poll" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.polls");

      // İki seçeneği olmayan bir oylama oylama değil. Hatayı burada vermek,
      // sunucudan dönen genel doğrulama mesajından anlaşılır oluyor.
      if (options.length < 2) return errorState(t("needTwoOptions"));

      const body = {
        question: input.question,
        description: input.description ?? null,
        options,
        weightMode: input.weightMode,
        quorumRule: input.quorumRule,
        visibility: input.visibility,
        allowMultiple: input.allowMultiple,
        ownersOnly: input.ownersOnly,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/communication/anketler/${input.id}`,
            body,
            pollSaveResult,
          )
        : await apiPost(
            "/v1/panel/communication/anketler",
            body,
            pollSaveResult,
          );

      revalidatePath("/panel/anketler");
      return okState(t("saved"), { data: { id: result.id } });
    },
  );
}

const closeSchema = z.object({
  id: uuidField,
  reason: optionalText(1000),
});

/**
 * Oylamayı kapat.
 *
 * Sonuç sunucuda hesaplanıp **saklanıyor**; bu eylem sonucu yalnız
 * gösteriyor. Kapatma geri alınamaz ve ekran bunu söylüyor.
 */
export async function closePoll(
  _previous: ActionState<{ winner: string | null; quorumMet: boolean }>,
  formData: FormData,
): Promise<ActionState<{ winner: string | null; quorumMet: boolean }>> {
  return runAction(
    {
      permission: "poll:write",
      schema: closeSchema,
      meta: { action: "poll_closed", resource: "poll" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.polls");

      const result = await apiPost(
        `/v1/panel/communication/anketler/${input.id}/kapat`,
        { reason: input.reason ?? null },
        pollCloseResult,
      );

      revalidatePath("/panel/anketler");
      return okState(
        result.quorumMet
          ? t("closedWithResult", { votes: result.totalVotes })
          : t("closedNoQuorum", { votes: result.totalVotes }),
        {
          data: {
            winner: result.winnerOptionId,
            quorumMet: result.quorumMet,
          },
        },
      );
    },
  );
}
