"use server";

import { getTranslations } from "next-intl/server";

import { expenseImportPreview, type ExpenseImport, type ExpenseImportPreview } from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { reasonMessage } from "@/lib/form";

export async function runExpenseImport(
  input: ExpenseImport,
  commit: boolean,
): Promise<{ ok: true; data: ExpenseImportPreview } | { ok: false; message: string }> {
  await requirePermission("expense:write");
  const t = await getTranslations("app.expenseImport");
  try {
    const data = await apiPost(commit ? "/v1/panel/expenses/import" : "/v1/panel/expenses/import/preview", input, expenseImportPreview);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: (await reasonMessage(error)) ?? t("failed") };
  }
}
