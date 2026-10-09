"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { cashWriteResult, INCOME_CATEGORIES } from "@yonetim/contracts";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  checkboxField,
  dateField,
  errorState,
  kurusField,
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Kasa işlemleri köprüsü. Hesap seçimi tek alan: "cash" ya da "bank:<id>" —
 * iki ayrı alan (tür + hesap) formda tutarsız bir çift seçilmesine izin verirdi.
 */
const accountField = z
  .string()
  .regex(/^(cash|bank:[0-9a-f-]{36})$/, "Hesap seçin.")
  .transform((v) =>
    v === "cash"
      ? { account: "cash" as const, bankAccountId: null }
      : { account: "bank" as const, bankAccountId: v.slice(5) },
  );

/** `dateField` İstanbul gece yarısı döndürüyor; UTC'ye çevirmek önceki güne düşürürdü. */
const isoDay = (d: Date) =>
  new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

const transferSchema = z.object({
  date: dateField,
  amountMinor: kurusField({ min: 1 }),
  from: accountField,
  to: accountField,
  description: optionalText(500),
  documentNo: optionalText(60),
});

export async function saveTransfer(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "bank:write",
      schema: transferSchema,
      meta: { action: "cash_transfer", resource: "cash_movement" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.cash");
      if (
        input.from.account === input.to.account &&
        input.from.bankAccountId === input.to.bankAccountId
      ) {
        return errorState(t("sameAccount"), { to: [t("sameAccount")] });
      }
      await apiPost(
        "/v1/panel/cash/transfers",
        {
          date: isoDay(input.date),
          amountMinor: input.amountMinor,
          from: input.from,
          to: input.to,
          description: input.description ?? null,
          documentNo: input.documentNo ?? null,
        },
        cashWriteResult,
      );
      return okState(t("transferSaved"));
    },
  );
}

const incomeSchema = z.object({
  date: dateField,
  amountMinor: kurusField({ min: 1 }),
  to: accountField,
  /** Sabit grup ya da `g:<uuid>` (kullanıcı tanımlı harici tahsilat grubu). */
  category: z
    .string()
    .refine(
      (v) => (INCOME_CATEGORIES as readonly string[]).includes(v) || /^g:[0-9a-f-]{36}$/.test(v),
      { message: V.invalidSelection },
    ),
  payerName: requiredText(2, 160),
  description: optionalText(500),
  documentNo: optionalText(60),
});

export async function saveIncome(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "bank:write",
      schema: incomeSchema,
      meta: { action: "cash_income", resource: "cash_movement" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.cash");
      await apiPost(
        "/v1/panel/cash/incomes",
        {
          date: isoDay(input.date),
          amountMinor: input.amountMinor,
          to: input.to,
          ...(input.category.startsWith("g:")
            ? { incomeGroupId: input.category.slice(2) }
            : { category: input.category }),
          payerName: input.payerName,
          description: input.description ?? null,
          documentNo: input.documentNo ?? null,
        },
        cashWriteResult,
      );
      return okState(t("incomeSaved"));
    },
  );
}

const voidSchema = z.object({ id: uuidField, reason: requiredText(5, 500) });

export async function voidMovement(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "bank:write",
      schema: voidSchema,
      meta: { action: "cash_movement_void", resource: "cash_movement" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.cash");
      await apiPost(
        `/v1/panel/cash/movements/${input.id}/void`,
        { reason: input.reason },
        cashWriteResult,
      );
      return okState(t("voided"));
    },
  );
}

const handoverSchema = z.object({
  date: dateField,
  fromName: requiredText(2, 160),
  toName: requiredText(2, 160),
  note: optionalText(2000),
});

export async function createHandover(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "bank:write",
      schema: handoverSchema,
      meta: { action: "cash_handover", resource: "cash_handover" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.cash");
      const result = await apiPost(
        "/v1/panel/cash/handovers",
        {
          date: isoDay(input.date),
          fromName: input.fromName,
          toName: input.toName,
          note: input.note ?? null,
        },
        cashWriteResult,
      );
      return okState(t("handoverSaved"), {
        redirectTo: `/panel/kasa/devir/${result.id}`,
      });
    },
  );
}

const groupSchema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), uuidField.optional()),
  name: requiredText(2, 80),
  accountCode: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || undefined : v),
    z.string().regex(/^6\d{2}(\.\d{1,3})?$/, V.invalidAccountCode).optional(),
  ),
  isActive: checkboxField,
});

/** Harici tahsilat grubu ekle/güncelle (hesap kodu yalnız eklerken). */
export async function saveIncomeGroup(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "bank:write",
      schema: groupSchema,
      meta: { action: "income_group_saved", resource: "income_group" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.cash");
      const body = { name: input.name, accountCode: input.accountCode ?? null, isActive: input.isActive };
      if (input.id) await apiPatch(`/v1/panel/cash/income-groups/${input.id}`, body, cashWriteResult);
      else await apiPost("/v1/panel/cash/income-groups", body, cashWriteResult);
      return okState(t("groupSaved", { name: input.name }));
    },
  );
}
