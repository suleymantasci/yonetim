"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { bankAccountSaveResult } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  checkboxField,
  ibanField,
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Banka hesabı yazma köprüsü — PROJE-DURUMU §5.2, sıra 6.
 *
 * Modülün girişiydi ve kapalıydı: mutabakat ekranı, hareket listesi ve
 * `bank_accounts` tablosu vardı ama hesap tanımlamanın yolu yoktu. Hesap
 * olmadan hareket de mutabakat da boş kalıyordu.
 *
 * IBAN doğrulaması **iki yerde**: `ibanField` burada (form hatası kullanıcıya
 * hemen dönsün diye) ve `apps/api`'de mod-97 kontrolüyle (bağlayıcı olan o).
 */

const PURPOSES = [
  "dues",
  "expense",
  "reserve",
  "project",
  "deposit",
  "other",
] as const;

const accountSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    uuidField.optional(),
  ),
  bankName: requiredText(2, 80),
  iban: ibanField,
  accountName: optionalText(160),
  purpose: z.enum(PURPOSES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  isActive: checkboxField,
});

export async function saveBankAccount(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "bank:write",
      schema: accountSchema,
      meta: { action: "bank_account_saved", resource: "bank_account" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.bank");

      const body = {
        bankName: input.bankName,
        iban: input.iban ?? "",
        accountName: input.accountName ?? null,
        purpose: input.purpose,
        isActive: input.isActive,
      };

      const result = input.id
        ? await apiPatch(
            `/v1/panel/bank/accounts/${input.id}`,
            body,
            bankAccountSaveResult,
          )
        : await apiPost("/v1/panel/bank/accounts", body, bankAccountSaveResult);

      // Tahsilat formundaki hesap listesi bu kayıttan besleniyor.

      return okState(t("accountSaved", { iban: result.ibanMasked }), {
        data: { id: result.id },
      });
    },
  );
}

export interface BankAccountMutationResult {
  ok: boolean;
  message: string;
}

export async function deleteBankAccount(
  id: string,
): Promise<BankAccountMutationResult> {
  await requirePermission("bank:write");
  const t = await getTranslations("app.bank");

  await apiDelete(`/v1/panel/bank/accounts/${id}`);

  return { ok: true, message: t("accountDeleted") };
}
