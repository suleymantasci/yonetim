import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Tedarikçi kartı ve cari ekstresi — `/v1/panel/vendors`.
 *
 * Cari, giderlerden **türetiliyor**: her onaylı/ödenmiş gider tedarikçiye
 * alacak (tahakkuk), ödeme tarihi dolu her gider borç (ödeme) satırı üretir.
 * Ayrı bir tedarikçi defteri tutulmuyor; tutulsaydı giderle defter iki ayrı
 * doğruluk kaynağı olur ve er geç ayrışırdı.
 */
export const vendorSave = z.object({
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(60),
  contactName: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(20).nullish(),
  email: z.string().trim().email().max(200).nullish().or(z.literal("").transform(() => null)),
  /** VKN (10 hane) ya da TCKN (11 hane) — BA/BS formu bunu istiyor. */
  taxNumber: z
    .string()
    .trim()
    .regex(/^\d{10,11}$/, "Vergi numarası 10, TC kimlik numarası 11 hane olmalı.")
    .nullish()
    .or(z.literal("").transform(() => null)),
  taxOffice: z.string().trim().max(80).nullish(),
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^TR\d{24}$/, "IBAN TR ile başlayan 26 karakter olmalı."))
    .nullish()
    .or(z.literal("").transform(() => null)),
  address: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  isActive: z.coerce.boolean().default(true),
});
export type VendorSave = z.infer<typeof vendorSave>;

export const vendorRow = z.object({
  id: uuid,
  name: z.string(),
  category: z.string(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  taxNumber: z.string().nullable(),
  taxOffice: z.string().nullable(),
  iban: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  /** Onaylı + ödenmiş giderlerin toplamı (KDV dahil). */
  totalMinor: moneyMinor,
  paidMinor: moneyMinor,
  /** Ödenmemiş — siteye göre tedarikçiye borç. */
  balanceMinor: moneyMinor,
  expenseCount: z.number().int(),
  lastExpenseAt: dateTime.nullable(),
});
export type VendorRow = z.infer<typeof vendorRow>;

export const vendorListResponse = z.object({
  rows: z.array(vendorRow),
  totals: z.object({
    vendors: z.number().int(),
    balanceMinor: moneyMinor,
    /** Tedarikçiye bağlanmamış (yalnız ad yazılmış) gider sayısı. */
    unlinkedExpenses: z.number().int(),
  }),
});
export type VendorListResponse = z.infer<typeof vendorListResponse>;

export const vendorLedgerLine = z.object({
  date: dateTime,
  expenseId: uuid,
  kind: z.enum(["invoice", "payment"]),
  description: z.string(),
  invoiceNo: z.string().nullable(),
  /** Tahakkuk (tedarikçi alacağı). */
  creditMinor: moneyMinor,
  /** Ödeme. */
  debitMinor: moneyMinor,
  /** Satır sonrası bakiye: pozitif = tedarikçiye borçluyuz. */
  balanceMinor: moneyMinor,
});

export const vendorDetail = z.object({
  vendor: vendorRow,
  ledger: z.array(vendorLedgerLine),
});
export type VendorDetail = z.infer<typeof vendorDetail>;

export const vendorSaveResult = z.object({ id: uuid, name: z.string() });

/** Gider formu için kısa liste. */
export const vendorOption = z.object({ id: uuid, name: z.string() });
export const vendorOptionList = z.array(vendorOption);
