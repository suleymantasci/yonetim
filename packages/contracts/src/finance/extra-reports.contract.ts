import { z } from "zod";

/**
 * Y6 raporları (Yönetimcell karşılıkları): tahsilat, detaylı gider + gider
 * grubu, günlük / aylık / aylık özet bilanço, borçlandırma durum + detay,
 * muhasebe kodları, üye notları.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optUuid = z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional());
const optText = z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(100).optional());

export const collectionReportQuery = z.object({
  from: day,
  to: day,
  kind: z.enum(["all", "member", "external"]).default("all"),
  blockId: optUuid,
  /** "cash" | banka hesabı id'si; yoksa tümü. */
  account: optText,
  q: optText,
});
export type CollectionReportQuery = z.infer<typeof collectionReportQuery>;
export const collectionReportResponse = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["member", "external"]),
      date: z.coerce.date(),
      receiptNo: z.string().nullable(),
      account: z.string(),
      unitLabel: z.string().nullable(),
      name: z.string().nullable(),
      description: z.string().nullable(),
      amountMinor: z.number(),
    }),
  ),
  totals: z.object({ memberMinor: z.number(), externalMinor: z.number(), totalMinor: z.number() }),
  options: z.object({
    blocks: z.array(z.object({ id: z.string(), name: z.string() })),
    accounts: z.array(z.object({ id: z.string(), label: z.string() })),
  }),
});
export type CollectionReportResponse = z.infer<typeof collectionReportResponse>;

export const expenseReportQuery = z.object({
  from: day,
  to: day,
  categoryId: optUuid,
  vendorId: optUuid,
  party: z.enum(["all", "expense", "vendor", "staff"]).default("all"),
  state: z.enum(["all", "paid", "unpaid"]).default("all"),
});
export type ExpenseReportQuery = z.infer<typeof expenseReportQuery>;
export const expenseReportResponse = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      date: z.coerce.date(),
      category: z.string().nullable(),
      party: z.enum(["expense", "vendor", "staff"]),
      partyName: z.string().nullable(),
      description: z.string(),
      invoiceNo: z.string().nullable(),
      amountMinor: z.number(),
      paid: z.boolean(),
    }),
  ),
  groups: z.array(z.object({ categoryId: z.string().nullable(), name: z.string().nullable(), count: z.number(), amountMinor: z.number(), paidMinor: z.number() })),
  totals: z.object({ amountMinor: z.number(), paidMinor: z.number() }),
  options: z.object({
    categories: z.array(z.object({ id: z.string(), name: z.string() })),
    vendors: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});
export type ExpenseReportResponse = z.infer<typeof expenseReportResponse>;

export const cashDaysQuery = z.object({ from: day, to: day, account: optText });
export const cashDaysResponse = z.object({
  openingMinor: z.number(),
  days: z.array(z.object({ day, inMinor: z.number(), outMinor: z.number(), closingMinor: z.number() })),
  accounts: z.array(z.object({ code: z.string(), label: z.string() })),
});
export type CashDaysResponse = z.infer<typeof cashDaysResponse>;

export const monthlyReportQuery = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export const monthlyReportResponse = z.object({
  period: z.string(),
  rows: z.array(
    z.object({
      unitId: z.string(),
      unitLabel: z.string(),
      holder: z.string().nullable(),
      accruedMinor: z.number(),
      collectedMinor: z.number(),
      remainingMinor: z.number(),
    }),
  ),
  totals: z.object({
    accruedMinor: z.number(),
    collectedMinor: z.number(),
    remainingMinor: z.number(),
    externalMinor: z.number(),
    expenseMinor: z.number(),
    expensePaidMinor: z.number(),
  }),
});
export type MonthlyReportResponse = z.infer<typeof monthlyReportResponse>;

export const debtRunQuery = z.object({
  typeId: optUuid,
  year: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}$/).optional()),
  period: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional()),
  from: z.preprocess((v) => (v === "" ? undefined : v), day.optional()),
  to: z.preprocess((v) => (v === "" ? undefined : v), day.optional()),
  /** Detay: tek borçlandırma (`batchKey` — durum raporundan). */
  batch: optText,
});
export type DebtRunQuery = z.infer<typeof debtRunQuery>;
export const debtRunResponse = z.object({
  batches: z.array(
    z.object({
      key: z.string(),
      createdAt: z.coerce.date(),
      typeName: z.string(),
      period: z.string().nullable(),
      description: z.string(),
      dueDate: day,
      count: z.number(),
      unitCount: z.number(),
      amountMinor: z.number(),
      paidMinor: z.number(),
      remainingMinor: z.number(),
    }),
  ),
  types: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type DebtRunResponse = z.infer<typeof debtRunResponse>;
export const debtRunDetailResponse = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      createdAt: z.coerce.date(),
      unitLabel: z.string(),
      debtorName: z.string().nullable(),
      typeName: z.string(),
      period: z.string().nullable(),
      description: z.string(),
      lateFeeMinor: z.number(),
      dueDate: day,
      amountMinor: z.number(),
      paidMinor: z.number(),
      remainingMinor: z.number(),
      status: z.string(),
    }),
  ),
  totals: z.object({ amountMinor: z.number(), paidMinor: z.number(), remainingMinor: z.number(), lateFeeMinor: z.number() }),
  truncated: z.boolean(),
});
export type DebtRunDetailResponse = z.infer<typeof debtRunDetailResponse>;

export const accountCodesResponse = z.object({
  accounts: z.array(z.object({ code: z.string(), name: z.string(), group: z.string() })),
  parties: z.array(z.object({ code: z.string(), name: z.string(), kind: z.enum(["vendor", "staff"]) })),
});
export type AccountCodesResponse = z.infer<typeof accountCodesResponse>;

export const memberNotesQuery = z.object({
  q: optText,
  from: z.preprocess((v) => (v === "" ? undefined : v), day.optional()),
  to: z.preprocess((v) => (v === "" ? undefined : v), day.optional()),
});
export const memberNotesResponse = z.object({
  rows: z.array(
    z.object({
      membershipId: z.string(),
      userId: z.string(),
      name: z.string(),
      role: z.string(),
      units: z.string().nullable(),
      note: z.string(),
      updatedAt: z.coerce.date(),
      updatedBy: z.string().nullable(),
    }),
  ),
});
export type MemberNotesResponse = z.infer<typeof memberNotesResponse>;
