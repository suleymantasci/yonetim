"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  bankAccountSaveResult,
  bankStatementPreview,
  bankStatementResult,
  bankTxActionResult,
  bankTxConfirmBulkResult,
  bankTxExpenseResult,
  type BankStatementPreview,
  type StatementFieldName,
} from "@yonetim/contracts";

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

/** Önerilen eşleşmeyi onaylar → tahsilat kaydı açar. */
export async function confirmBankTransaction(id: string): Promise<BankAccountMutationResult> {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  try {
    await apiPost(`/v1/panel/bank/transactions/${id}/confirm`, {}, bankTxActionResult);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : t("confirmFailed") };
  }
  return { ok: true, message: t("confirmed") };
}

export async function ignoreBankTransaction(
  id: string,
  reason: string,
): Promise<BankAccountMutationResult> {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  if (reason.trim().length < 3) return { ok: false, message: t("ignoreReasonShort") };
  try {
    await apiPost(`/v1/panel/bank/transactions/${id}/ignore`, { reason }, bankTxActionResult);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : t("confirmFailed") };
  }
  return { ok: true, message: t("ignored") };
}

/* ------------------------------------------------------------------ *
 * Döküm içe aktarma (önizle → eşleştir → aktar) ve eşleştirme kuyruğu
 * ------------------------------------------------------------------ */

export interface StatementFileInput {
  accountId: string;
  fileName: string;
  fileBase64: string;
  headerRow?: number;
  mapping?: Record<string, StatementFieldName>;
}

type Outcome<T> = { ok: true; data: T; message?: string } | { ok: false; message: string };

/** API'nin `statement_*` / `conflict:*` kodunu kullanıcı metnine çevir. */
async function explain(error: unknown): Promise<string> {
  const t = await getTranslations("app.bank");
  const raw = error instanceof Error ? error.message : "";
  const code = raw.replace(/^[a-z_]+:/, "");
  if (raw.startsWith("statement_") && t.has(`fileError.${raw}`)) return t(`fileError.${raw}`);
  if (t.has(`rowError.${code}`)) return t(`rowError.${code}`);
  return raw || t("confirmFailed");
}

/** Dosyayı oku, sütunları tahmin et (ya da verilen eşleştirmeyi uygula). Yazmaz. */
export async function previewStatement(input: StatementFileInput): Promise<Outcome<BankStatementPreview>> {
  await requirePermission("bank:reconcile");
  try {
    const data = await apiPost("/v1/panel/bank/statement/preview", input, bankStatementPreview);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}

export async function importStatementFile(
  input: Required<Omit<StatementFileInput, "headerRow" | "mapping">> & {
    headerRow: number;
    mapping: Record<string, StatementFieldName>;
  },
): Promise<Outcome<{ inserted: number }>> {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  try {
    const result = await apiPost("/v1/panel/bank/statement", input, bankStatementResult);
    return {
      ok: true,
      data: { inserted: result.inserted },
      message: t("importDone", {
        inserted: result.inserted,
        refreshed: result.refreshed,
        suggested: result.suggested,
        unmatched: result.unmatched,
        outgoing: result.outgoing,
        duplicates: result.duplicates,
      }),
    };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}

/** Seçilen gelen hareketleri seçilen dairelere tahsil et. */
export async function confirmBankTransactions(
  items: Array<{ id: string; unitId: string }>,
): Promise<Outcome<{ okIds: string[]; failed: Array<{ id: string; message: string }> }>> {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  if (items.length === 0) return { ok: false, message: t("selectionEmpty") };
  try {
    const { results } = await apiPost("/v1/panel/bank/transactions/confirm-bulk", { items }, bankTxConfirmBulkResult);
    const okIds = results.filter((r) => r.ok).map((r) => r.id);
    const failed = await Promise.all(
      results
        .filter((r) => !r.ok)
        .map(async (r) => ({ id: r.id, message: await explain(new Error(r.error ?? "")) })),
    );
    return {
      ok: true,
      data: { okIds, failed },
      message: failed.length
        ? t("bulkPartial", { ok: okIds.length, failed: failed.length })
        : t("bulkConfirmed", { count: okIds.length }),
    };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}

/** Çıkan hareketi ödenmiş gider olarak kaydet. */
export async function recordBankExpense(
  id: string,
  input: { categoryId: string; vendorId?: string | null },
): Promise<Outcome<{ expenseId: string }>> {
  await requirePermission("bank:reconcile");
  const t = await getTranslations("app.bank");
  if (!input.categoryId) return { ok: false, message: t("categoryRequired") };
  try {
    const result = await apiPost(
      `/v1/panel/bank/transactions/${id}/expense`,
      { categoryId: input.categoryId, vendorId: input.vendorId || null },
      bankTxExpenseResult,
    );
    return { ok: true, data: { expenseId: result.expenseId }, message: t("expenseRecorded") };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}
