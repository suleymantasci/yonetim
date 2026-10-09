import { z } from "zod";

import { dateTime, isoDate, moneyMinor, uuid } from "../_shared/fields";

/**
 * Ödenecekler — Yönetimcell "Giderler → Borç listesi" ve "İleri tarihli
 * borçlar (tekrarlayan faturalar)" karşılığı. `/v1/panel/payables`.
 */
export const payablesQuery = z.object({
  /** `expense`: firma/personel dışı gider; `vendor`: firma; `staff`: personel. */
  party: z.enum(["all", "expense", "vendor", "staff"]).default("all"),
  state: z.enum(["pending", "paid", "all"]).default("pending"),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const payableRow = z.object({
  id: uuid,
  party: z.enum(["expense", "vendor", "staff"]),
  partyName: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string(),
  date: dateTime,
  invoiceNo: z.string().nullable(),
  amountMinor: moneyMinor,
  paid: z.boolean(),
  paidAt: dateTime.nullable(),
  recurring: z.boolean(),
});

export const payablesResponse = z.object({
  rows: z.array(payableRow),
  totals: z.object({ pendingMinor: moneyMinor, paidMinor: moneyMinor }),
});
export type PayablesResponse = z.infer<typeof payablesResponse>;

export const recurringExpenseRow = z.object({
  id: uuid,
  description: z.string(),
  categoryId: uuid.nullable(),
  categoryName: z.string().nullable(),
  vendorId: uuid.nullable(),
  vendorName: z.string().nullable(),
  staffId: uuid.nullable(),
  staffName: z.string().nullable(),
  amountMinor: moneyMinor,
  vatRate: z.number(),
  dayOfMonth: z.number().int(),
  startPeriod: z.string(),
  endPeriod: z.string().nullable(),
  lastPeriod: z.string().nullable(),
  isActive: z.boolean(),
  generated: z.number().int(),
  /** Sıradaki üretim tarihi (bitmişse `null`). */
  nextDate: z.string().nullable(),
});

export const recurringExpenseList = z.object({
  rows: z.array(recurringExpenseRow),
  options: z.object({
    categories: z.array(z.object({ id: uuid, name: z.string() })),
    vendors: z.array(z.object({ id: uuid, name: z.string() })),
    staff: z.array(z.object({ id: uuid, name: z.string() })),
  }),
});
export type RecurringExpenseList = z.infer<typeof recurringExpenseList>;

const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const recurringExpenseSave = z
  .object({
    description: z.string().trim().min(3).max(240),
    categoryId: uuid.nullish(),
    vendorId: uuid.nullish(),
    staffId: uuid.nullish(),
    amountMinor: z.coerce.number().int().positive(),
    vatRate: z.coerce.number().min(0).max(1).default(0.2),
    dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
    startPeriod: period,
    endPeriod: period.nullish(),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => !v.endPeriod || v.endPeriod >= v.startPeriod, { message: "end_before_start", path: ["endPeriod"] })
  .refine((v) => !(v.vendorId && v.staffId), { message: "vendor_or_staff", path: ["staffId"] });
export type RecurringExpenseSave = z.infer<typeof recurringExpenseSave>;
