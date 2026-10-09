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
  blockId: uuid.optional(),
  debtTypeId: uuid.optional(),
  /** Bu dönem ve öncesi (`YYYY-MM`; dönemsiz borçta vade ayı). */
  periodUntil: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  /** Daire toplamı en az (kuruş) — tebligat eşiği. */
  minTotal: z.coerce.number().int().min(0).optional(),
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
      /** Kalemlerdeki borçlular (tebligatta "Sayın …"). */
      debtors: z.array(z.string()),
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

/* ------------------------------ Yazışma alıcıları ------------------------------ */

/**
 * Etiket, çağrı mektubu ve vekaletname alıcıları — bağımsız bölüm başına
 * kapsamdaki kişiler. Telefon yalnız `phones=1` ile ve denetim kaydıyla döner.
 */
export const recipientQuery = z.object({
  member: memberScope.optional(),
  blockId: uuid.optional(),
  phones: z.enum(["0", "1"]).default("0"),
});

export const recipientRow = z.object({
  unitId: uuid,
  unitLabel: z.string(),
  blockName: z.string().nullable(),
  people: z.array(
    z.object({
      userId: uuid,
      name: z.string(),
      relation: z.string(),
      former: z.boolean(),
      phone: z.string().nullable(),
    }),
  ),
  landShare: z.string().nullable(),
});

export const recipientResponse = z.object({ rows: z.array(recipientRow) });
export type RecipientResponse = z.infer<typeof recipientResponse>;

/* ------------------------------ Silinen hareketler ------------------------------ */

export const DELETED_KINDS = ["debt", "payment", "cash", "expense"] as const;

export const deletedQuery = z.object({ from: isoDate, to: isoDate, kind: z.enum(DELETED_KINDS).optional() });

export const deletedRow = z.object({
  kind: z.enum(DELETED_KINDS),
  id: uuid,
  at: dateTime,
  description: z.string(),
  unitLabel: z.string().nullable(),
  amountMinor: moneyMinor,
  byName: z.string().nullable(),
  reason: z.string().nullable(),
});

export const deletedResponse = z.object({
  rows: z.array(deletedRow),
  totals: z.object({ count: z.number().int(), amountMinor: moneyMinor }),
});
export type DeletedResponse = z.infer<typeof deletedResponse>;

/* ------------------------------ Gönderim raporu ------------------------------ */

export const MESSAGE_CHANNELS = ["sms", "email", "whatsapp"] as const;

export const messageReportQuery = z.object({
  from: isoDate,
  to: isoDate,
  channel: z.enum(MESSAGE_CHANNELS).optional(),
  status: z.enum(["sent", "failed", "pending"]).optional(),
});

export const messageReportRow = z.object({
  id: uuid,
  at: dateTime,
  channel: z.string(),
  status: z.string(),
  /** Maskeli alıcı (telefon/e-posta). */
  recipient: z.string(),
  recipientName: z.string().nullable(),
  subject: z.string().nullable(),
  error: z.string().nullable(),
  costMinor: moneyMinor,
});

export const messageReportResponse = z.object({
  rows: z.array(messageReportRow),
  byChannel: z.array(
    z.object({ channel: z.string(), sent: z.number().int(), failed: z.number().int(), pending: z.number().int(), costMinor: moneyMinor }),
  ),
});
export type MessageReportResponse = z.infer<typeof messageReportResponse>;
