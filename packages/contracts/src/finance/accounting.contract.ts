import { z } from "zod";

import { moneyMinor, uuid } from "../_shared/fields";

/**
 * Muhasebe raporları — `/v1/panel/reports/accounting/*`.
 *
 * SENTETİK ÇİFT KAYIT: sistem ayrı bir yevmiye defteri tutmuyor; mizan,
 * mevcut kayıtlardan (borç tahakkuku, tahsilat, gider, gider ödemesi)
 * Tek Düzen Hesap Planı kodlarına eşlenerek **türetiliyor**. Her hareket iki
 * taraflı yazıldığı için borç ve alacak toplamları eşittir. Resmî defter
 * yerine geçmez; mali müşavire dönem özeti olarak verilir.
 */
export const mizanQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type MizanQuery = z.infer<typeof mizanQuery>;

export const mizanRow = z.object({
  code: z.string(),
  name: z.string(),
  /** Alt hesap mı (ör. 770.xx gider kategorisi). */
  sub: z.boolean(),
  debitMinor: moneyMinor,
  creditMinor: moneyMinor,
  /** Borç bakiye (pozitif) ya da alacak bakiye (negatif). */
  balanceMinor: moneyMinor,
});

export const mizanResponse = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(mizanRow),
  totals: z.object({ debitMinor: moneyMinor, creditMinor: moneyMinor }),
});
export type MizanResponse = z.infer<typeof mizanResponse>;

/** BA/BS bildirim eşiği (VUK 396 Sıra No.lu Tebliğ): KDV hariç 5.000 TL. */
export const BA_BS_THRESHOLD_MINOR = 500_000;

export const baBsQuery = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const baBsRow = z.object({
  counterpartyId: uuid.nullable(),
  name: z.string(),
  taxNumber: z.string().nullable(),
  documentCount: z.number().int(),
  /** KDV hariç tutar. */
  netMinor: moneyMinor,
});

export const baBsResponse = z.object({
  period: z.string(),
  thresholdMinor: moneyMinor,
  /** Form BA — mal ve hizmet alımları (tedarikçiler). */
  ba: z.array(baBsRow),
  /** Form BS — mal ve hizmet satışları (dairelere tahakkuk). */
  bs: z.array(baBsRow),
  /** Eşiği geçen ama vergi numarası eksik tedarikçi sayısı. */
  missingTaxNumbers: z.number().int(),
});
export type BaBsResponse = z.infer<typeof baBsResponse>;
