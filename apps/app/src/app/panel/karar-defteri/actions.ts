"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  DECISION_KINDS,
  DECISION_QUORUM_RULES,
  decisionEntryCreateResult,
} from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import {
  checkboxField,
  dateField,
  okState,
  optionalUuidField,
  requiredText,
  runAction,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Karar Defteri — KMK md.32.
 *
 * **Tek eylem var: yazma.** Güncelleme ve silme eylemi yok ve eklenmemeli;
 * defter ekleme-yalnız. Yanlış yazılan karar düzeltilmez, düzelten yeni bir
 * karar yazılır (`correctsEntryId`). Veritabanı trigger'ı da bunu engelliyor,
 * yani burada bir eylem eklemek çalışmaz — sessizce bozulmaz, hata verir.
 *
 * `entryNo` gönderilmiyor: numarayı sunucu veriyor (bkz. sözleşme notu).
 */

/**
 * Oy alanları **metin** olarak doğrulanıyor.
 *
 * Arsa payı ağırlıklı oylamada değer kesirli olabiliyor (`312,5`) ve
 * `number`a çevirmek yuvarlama kaybı demek. Karar defteri hukuki bir belge;
 * `312,499999` yazması kabul edilebilir değil. Virgülü sunucu noktaya
 * çeviriyor.
 */
const voteField = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? "0" : value),
  z.string().trim().regex(/^\d{1,6}([.,]\d{1,6})?$/, V.invalidAmount),
);

const decisionSchema = z.object({
  decidedAt: dateField,
  kind: z.enum(DECISION_KINDS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  meetingId: optionalUuidField,
  subject: requiredText(3, 200),
  body: requiredText(10, 20_000),
  quorumRule: z.enum(DECISION_QUORUM_RULES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  votesFor: voteField,
  votesAgainst: voteField,
  abstentions: voteField,
  passed: checkboxField,
  correctsEntryId: optionalUuidField,
  bookPageNo: z.preprocess(
    (value) => (value === "" || value === null ? undefined : Number(value)),
    z.number().int().min(1).max(100_000).optional(),
  ),
});

export async function createDecisionEntry(
  _previous: ActionState<{ entryNo: number }>,
  formData: FormData,
): Promise<ActionState<{ entryNo: number }>> {
  return runAction(
    {
      permission: "decision:write",
      schema: decisionSchema,
      meta: {
        action: "decision_book_entry_created",
        resource: "decision_book_entry",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.decisionBook");

      const created = await apiPost(
        "/v1/panel/decision-book",
        {
          decidedAt: input.decidedAt,
          kind: input.kind,
          meetingId: input.meetingId ?? null,
          subject: input.subject,
          body: input.body,
          quorumRule: input.quorumRule,
          votesFor: input.votesFor,
          votesAgainst: input.votesAgainst,
          abstentions: input.abstentions,
          passed: input.passed,
          correctsEntryId: input.correctsEntryId ?? null,
          bookPageNo: input.bookPageNo ?? null,
        },
        decisionEntryCreateResult,
      );

      revalidatePath("/panel/karar-defteri");
      return okState(t("created", { no: created.entryNo }), {
        data: { entryNo: created.entryNo },
      });
    },
  );
}
