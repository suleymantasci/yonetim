import { z } from "zod";

import { dateTime, isoDate, moneyMinor, uuid } from "../_shared/fields";

/**
 * Mali tablolar — `/v1/panel/reports/accounting/*` (mizan/yevmiye ile aynı
 * fiş listesinden): gelir-gider tablosu, bilanço, kebir, işletme defteri,
 * toplu hesap özeti, faaliyet özeti.
 *
 * Hepsi sentetik çift kayıttan türüyor; biri diğeriyle çelişemez: bilançodaki
 * dönem sonucu = gelir-gider tablosunun neti, kasa satırı = işletme
 * defterinin kalanı, 120 = hesap özetlerinin toplamı.
 */

export const rangeQuery = z.object({ from: isoDate, to: isoDate });

/* ------------------------------ Gelir-gider ------------------------------ */

export const statementRow = z.object({
  code: z.string(),
  name: z.string(),
  byMonth: z.array(moneyMinor),
  totalMinor: moneyMinor,
});

export const incomeStatementResponse = z.object({
  from: z.string(),
  to: z.string(),
  /** `YYYY-MM` sütunları (en çok 24). */
  months: z.array(z.string()),
  income: z.array(statementRow),
  expense: z.array(statementRow),
  totals: z.object({
    incomeByMonth: z.array(moneyMinor),
    expenseByMonth: z.array(moneyMinor),
    netByMonth: z.array(moneyMinor),
    incomeMinor: moneyMinor,
    expenseMinor: moneyMinor,
    netMinor: moneyMinor,
  }),
});
export type IncomeStatementResponse = z.infer<typeof incomeStatementResponse>;

/* -------------------------------- Bilanço -------------------------------- */

export const balanceSheetQuery = z.object({ at: isoDate });

export const balanceLine = z.object({
  code: z.string(),
  name: z.string(),
  amountMinor: moneyMinor,
  sub: z.boolean(),
});

export const balanceSheetResponse = z.object({
  at: z.string(),
  assets: z.array(balanceLine),
  liabilities: z.array(balanceLine),
  equity: z.array(balanceLine),
  totals: z.object({
    assetsMinor: moneyMinor,
    liabilitiesMinor: moneyMinor,
    equityMinor: moneyMinor,
    /** Yıl başından bugüne gelir − gider (özkaynak içinde). */
    periodResultMinor: moneyMinor,
  }),
});
export type BalanceSheetResponse = z.infer<typeof balanceSheetResponse>;

/* --------------------------------- Kebir --------------------------------- */

export const ledgerQuery = rangeQuery.extend({
  code: z.string().regex(/^\d{3}(\.\d{2,3})?$/),
});

export const ledgerLine = z.object({
  date: dateTime,
  source: z.string(),
  sourceId: z.string().nullable(),
  description: z.string(),
  /** Karşı hesap(lar). */
  counter: z.string(),
  debitMinor: moneyMinor,
  creditMinor: moneyMinor,
  /** Borç bakiye pozitif. */
  balanceMinor: moneyMinor,
});

export const ledgerResponse = z.object({
  from: z.string(),
  to: z.string(),
  code: z.string(),
  name: z.string(),
  openingMinor: moneyMinor,
  lines: z.array(ledgerLine),
  totals: z.object({ debitMinor: moneyMinor, creditMinor: moneyMinor }),
  closingMinor: moneyMinor,
  truncated: z.boolean(),
  /** Seçim listesi: hareketi olan tüm hesaplar. */
  accounts: z.array(z.object({ code: z.string(), name: z.string() })),
});
export type LedgerResponse = z.infer<typeof ledgerResponse>;

/* ---------------------------- İşletme defteri ---------------------------- */

export const operatingBookLine = z.object({
  date: dateTime,
  description: z.string(),
  /** Hangi kasa/banka. */
  account: z.string(),
  /** Gelir/gider hesabının adı (ör. "Aidat tahsilatı", "Elektrik"). */
  head: z.string(),
  incomeMinor: moneyMinor,
  expenseMinor: moneyMinor,
  balanceMinor: moneyMinor,
});

export const operatingBookResponse = z.object({
  from: z.string(),
  to: z.string(),
  openingMinor: moneyMinor,
  lines: z.array(operatingBookLine),
  totals: z.object({ incomeMinor: moneyMinor, expenseMinor: moneyMinor }),
  closingMinor: moneyMinor,
  truncated: z.boolean(),
});
export type OperatingBookResponse = z.infer<typeof operatingBookResponse>;

/* -------------------------- Toplu hesap özeti --------------------------- */

export const unitStatementQuery = rangeQuery.extend({
  unitId: uuid.optional(),
  /** "1" ise her bölüm için hareket satırları da döner (toplu döküm). */
  detail: z.enum(["0", "1"]).optional(),
  /** "1" ise yalnız bakiyesi olan bölümler. */
  onlyOpen: z.enum(["0", "1"]).optional(),
});

export const unitStatementLine = z.object({
  date: dateTime,
  description: z.string(),
  debitMinor: moneyMinor,
  creditMinor: moneyMinor,
  balanceMinor: moneyMinor,
});

export const unitStatementRow = z.object({
  unitId: uuid,
  label: z.string(),
  holder: z.string().nullable(),
  openingMinor: moneyMinor,
  chargedMinor: moneyMinor,
  paidMinor: moneyMinor,
  closingMinor: moneyMinor,
  lines: z.array(unitStatementLine).nullable(),
});

export const unitStatementResponse = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(unitStatementRow),
  totals: z.object({
    openingMinor: moneyMinor,
    chargedMinor: moneyMinor,
    paidMinor: moneyMinor,
    closingMinor: moneyMinor,
  }),
});
export type UnitStatementResponse = z.infer<typeof unitStatementResponse>;

/* ---------------------------- Faaliyet özeti ----------------------------- */

export const activitySummaryResponse = z.object({
  from: z.string(),
  to: z.string(),
  finance: z.object({
    chargedMinor: moneyMinor,
    collectedMinor: moneyMinor,
    otherIncomeMinor: moneyMinor,
    expenseMinor: moneyMinor,
    receivablesMinor: moneyMinor,
    overdueUnits: z.number().int(),
    unitCount: z.number().int(),
  }),
  topExpenses: z.array(z.object({ name: z.string(), amountMinor: moneyMinor })),
  requests: z.object({
    opened: z.number().int(),
    resolved: z.number().int(),
    open: z.number().int(),
  }),
  maintenance: z.object({
    done: z.number().int(),
    costMinor: moneyMinor,
    overdue: z.number().int(),
  }),
  meetings: z.array(
    z.object({
      date: dateTime,
      title: z.string(),
      kind: z.string(),
      status: z.string(),
      decisions: z.number().int(),
    }),
  ),
  announcements: z.number().int(),
  reservations: z.number().int(),
  legal: z.object({
    opened: z.number().int(),
    closed: z.number().int(),
    open: z.number().int(),
  }),
  staffCount: z.number().int(),
  budget: z
    .object({
      id: uuid,
      name: z.string(),
      plannedToDateMinor: moneyMinor,
      actualToDateMinor: moneyMinor,
    })
    .nullable(),
});
export type ActivitySummaryResponse = z.infer<typeof activitySummaryResponse>;
