"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPost } from "@/lib/api/server";
import {
  asArray,
  okState,
  runAction,
  uuidField,
  type ActionState,
} from "@/lib/form";

/**
 * Oy kullanma köprüsü — SPEC Bölüm 6.1, PROJE-DURUMU §5.11.
 *
 * Kural burada değil `apps/api`'de: kim oy verebilir (KMK md.31 malik
 * şartı), daire başına bir oy ve arsa payı ağırlığı sunucuda. Bu dosyada
 * yalnız formun doğrulaması ve HTTP var — ağırlık gövdeye hiç girmiyor,
 * girseydi sakin kendi oyunun ağırlığını yazardı.
 */
const voteSchema = z.object({
  pollId: uuidField,
  /*
   * `asArray` ile normalleştiriliyor: `formToObject` tek işaretlemede düz
   * bir metin, iki işaretlemede dizi üretiyor. Şemayı yalnız diziye göre
   * yazmak, tek seçenekli oylamada — yani çoğunlukta — formu kırardı.
   */
  optionIds: z.preprocess(
    asArray,
    z.array(z.string().min(1).max(40)).min(1).max(20),
  ),
});

export async function castVote(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "poll:vote",
      schema: voteSchema,
      meta: { action: "poll_vote", resource: "poll" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.myPolls");

      await apiPost(
        `/v1/panel/portal/polls/${input.pollId}/vote`,
        { optionIds: input.optionIds },
        z.object({ ok: z.literal(true) }),
      );

      // Özet kartındaki "oy bekleyen anket" sayacı da düşmeli; aksi halde
      // sakin oyunu verdikten sonra ana ekranda hâlâ bekleyen bir iş görür.

      return okState(t("voteRecorded"));
    },
  );
}
