import { z } from "zod";

import { dateTime, isoDate, moneyMinor, uuid } from "../_shared/fields";
import { memberScope } from "../_shared/member-scope";

/**
 * Borç raporları — `/v1/panel/reports/debts/*`.
 *
 * 1. Dönem matrisi: satır daire (taşınmaz) ya da kişi (üye), sütun yılın
 *    ayları; değer kalan / tahakkuk / ödenen; dönem- ya da vade-esaslı.
 *    "Kim hangi ay borçlu" tablosu.
 * 2. Açık kalem dökümü: daire başına ödenmemiş borçlar (toplu borç dökümü).
 * 3. Makbuz dökümü: aralıktaki tahsilatlar makbuz bilgileriyle.
 */
export const DEBT_MATRIX_VALUES = ["remaining", "charged", "paid"] as const;

export const debtMatrixQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  rows: z.enum(["unit", "member"]).default("unit"),
  value: z.enum(DEBT_MATRIX_VALUES).default("remaining"),
  /** `period`: borcun dönemi (yoksa vade ayı); `due`: vade ayı. */
  basis: z.enum(["period", "due"]).default("period"),
  /** "1" ise gecikme tazminatı dahil. */
  lateFee: z.enum(["0", "1"]).default("1"),
  member: memberScope.optional(),
  debtTypeId: uuid.optional(),
});

export type DebtMatrixQuery = z.infer<typeof debtMatrixQuery>;

export const debtMatrixRow = z.object({
  key: z.string(),
  label: z.string(),
  /** Daire satırında oturan/malik adı; kişi satırında daire(ler) ve ilişki. */
  sub: z.string().nullable(),
  /** Yıl öncesi (devreden). */
  beforeMinor: moneyMinor,
  /** 12 ay, Ocak → Aralık. */
  months: z.array(moneyMinor),
  /** Yıl sonrası (ileri vadeli taksitler). */
  afterMinor: moneyMinor,
  totalMinor: moneyMinor,
});

export const debtMatrixResponse = z.object({
  year: z.number().int(),
  rows: z.array(debtMatrixRow),
  totals: debtMatrixRow.omit({ key: true, label: true, sub: true }),
});

export type DebtMatrixResponse = z.infer<typeof debtMatrixResponse>;

export const openItemsQuery = z.object({
  member: memberScope.optional(),
  unitId: uuid.optional(),
  /** Yalnız vadesi geçmiş kalemler. */
  overdueOnly: z.enum(["0", "1"]).default("0"),
});

export const openItem = z.object({
  debtId: uuid,
  description: z.string(),
  period: z.string().nullable(),
  dueDate: dateTime,
  debtorName: z.string().nullable(),
  amountMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  paidMinor: moneyMinor,
  remainingMinor: moneyMinor,
  overdue: z.boolean(),
});

export const openItemsResponse = z.object({
  units: z.array(
    z.object({
      unitId: uuid,
      label: z.string(),
      holder: z.string().nullable(),
      items: z.array(openItem),
      totalMinor: moneyMinor,
      overdueMinor: moneyMinor,
    }),
  ),
  totalMinor: moneyMinor,
  overdueMinor: moneyMinor,
});

export type OpenItemsResponse = z.infer<typeof openItemsResponse>;

export const receiptListQuery = z.object({
  from: isoDate,
  to: isoDate,
  member: memberScope.optional(),
});

export const receiptRow = z.object({
  paymentId: uuid,
  receiptNo: z.string().nullable(),
  paidAt: dateTime,
  unitLabel: z.string().nullable(),
  payerName: z.string().nullable(),
  debtorName: z.string().nullable(),
  method: z.string(),
  amountMinor: moneyMinor,
  /** Mahsup edilen borçlar: makbuzun "açıklama" satırları. */
  allocations: z.array(z.object({ description: z.string(), amountMinor: moneyMinor })),
});

export const receiptListResponse = z.object({
  rows: z.array(receiptRow),
  totalMinor: moneyMinor,
});

export type ReceiptListResponse = z.infer<typeof receiptListResponse>;
