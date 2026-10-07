import { z } from "zod";

import {
  dateTime,
  isoDate,
  moneyMinor,
  positiveMoneyMinor,
  uuid,
} from "../_shared/fields";

/**
 * Kasa işlemleri — `/v1/panel/cash/*`.
 *
 * Kasa (100) ve banka hesapları (102.xx) arasında tahakkuksuz para
 * hareketleri: virman ve aidat dışı gelir (harici tahsilat). İkisi de
 * yevmiyeye girer; bakiye, mizan ve bilanço aynı fiş listesinden türer.
 * Kasa devir tutanağı ise yalnız bir fotoğraf: kayıt doğurmaz.
 */

/** "cash" = nakit kasa; "bank" = `bankAccountId` ile seçilen hesap. */
export const CASH_ACCOUNT_KINDS = ["cash", "bank"] as const;
export const cashAccountKind = z.enum(CASH_ACCOUNT_KINDS);

/** Harici tahsilat grupları — her biri ayrı gelir alt hesabı (602.xx / 642). */
export const INCOME_CATEGORIES = [
  "rent",
  "advertising",
  "interest",
  "donation",
  "compensation",
  "sale",
  "other",
] as const;
export const incomeCategory = z.enum(INCOME_CATEGORIES);
export type IncomeCategory = z.infer<typeof incomeCategory>;

const accountRef = z
  .object({ account: cashAccountKind, bankAccountId: uuid.nullish() })
  .refine((v) => (v.account === "bank") === Boolean(v.bankAccountId), {
    message: "bank_account_required",
  });

export const cashTransferCreate = z
  .object({
    date: isoDate,
    amountMinor: positiveMoneyMinor,
    from: accountRef,
    to: accountRef,
    description: z.string().trim().max(500).nullish(),
    documentNo: z.string().trim().max(60).nullish(),
  })
  .refine(
    (v) =>
      v.from.account !== v.to.account ||
      (v.from.bankAccountId ?? null) !== (v.to.bankAccountId ?? null),
    { message: "same_account", path: ["to"] },
  );
export type CashTransferCreate = z.infer<typeof cashTransferCreate>;

export const cashIncomeCreate = z.object({
  date: isoDate,
  amountMinor: positiveMoneyMinor,
  to: accountRef,
  category: incomeCategory,
  payerName: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).nullish(),
  documentNo: z.string().trim().max(60).nullish(),
});
export type CashIncomeCreate = z.infer<typeof cashIncomeCreate>;

export const cashVoid = z.object({ reason: z.string().trim().min(5).max(500) });
export type CashVoid = z.infer<typeof cashVoid>;

export const cashAccountBalance = z.object({
  /** Hesap planı kodu: 100 ya da 102.xx. */
  code: z.string(),
  account: cashAccountKind,
  bankAccountId: uuid.nullable(),
  label: z.string(),
  balanceMinor: moneyMinor,
  /** Son 30 gün giriş / çıkış. */
  inMinor: moneyMinor,
  outMinor: moneyMinor,
});
export type CashAccountBalance = z.infer<typeof cashAccountBalance>;

export const cashMovementRow = z.object({
  id: uuid,
  kind: z.enum(["transfer", "income"]),
  date: dateTime,
  amountMinor: moneyMinor,
  fromLabel: z.string().nullable(),
  toLabel: z.string(),
  category: z.string().nullable(),
  payerName: z.string().nullable(),
  description: z.string().nullable(),
  documentNo: z.string().nullable(),
  voidedAt: dateTime.nullable(),
  voidReason: z.string().nullable(),
});
export type CashMovementRow = z.infer<typeof cashMovementRow>;

export const cashOverview = z.object({
  accounts: z.array(cashAccountBalance),
  totalMinor: moneyMinor,
  movements: z.array(cashMovementRow),
  /** Seçim listeleri için aktif banka hesapları. */
  bankOptions: z.array(z.object({ id: uuid, label: z.string() })),
});
export type CashOverview = z.infer<typeof cashOverview>;

/* ------------------------------------------------------------------ *
 * Kasa devir tutanağı
 * ------------------------------------------------------------------ */

export const handoverSnapshot = z.object({
  accounts: z.array(
    z.object({ code: z.string(), label: z.string(), balanceMinor: moneyMinor }),
  ),
  cashTotalMinor: moneyMinor,
  /** 120: sakinlerden alacak. */
  receivablesMinor: moneyMinor,
  /** 196: personel avansları. */
  advancesMinor: moneyMinor,
  /** 320: tedarikçilere borç. */
  vendorPayablesMinor: moneyMinor,
  /** 335: personele borç. */
  staffPayablesMinor: moneyMinor,
  /** Net: varlıklar − borçlar. */
  netMinor: moneyMinor,
  /** En çok borçlu ilk 20 daire. */
  debtors: z.array(z.object({ unit: z.string(), balanceMinor: moneyMinor })),
  openDebtorCount: z.number().int(),
});
export type HandoverSnapshot = z.infer<typeof handoverSnapshot>;

export const cashHandoverCreate = z.object({
  date: isoDate,
  fromName: z.string().trim().min(2).max(160),
  toName: z.string().trim().min(2).max(160),
  note: z.string().trim().max(2000).nullish(),
});
export type CashHandoverCreate = z.infer<typeof cashHandoverCreate>;

export const cashHandoverRow = z.object({
  id: uuid,
  date: dateTime,
  fromName: z.string(),
  toName: z.string(),
  note: z.string().nullable(),
  snapshot: handoverSnapshot,
  createdAt: dateTime,
});
export type CashHandoverRow = z.infer<typeof cashHandoverRow>;

export const cashHandoverList = z.object({ rows: z.array(cashHandoverRow) });

export const cashWriteResult = z.object({ id: uuid });
