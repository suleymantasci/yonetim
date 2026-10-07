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
  /** Alt hesap mı (ör. 102.01 banka hesabı, 770.xx gider kategorisi). */
  sub: z.boolean(),
  /** Devir: dönem başına kadarki bakiye (borç pozitif, alacak negatif). */
  openingMinor: moneyMinor,
  /** Dönem hareketleri. */
  debitMinor: moneyMinor,
  creditMinor: moneyMinor,
  /** Devir + dönem: borç bakiye (pozitif) ya da alacak bakiye (negatif). */
  balanceMinor: moneyMinor,
});

export const mizanResponse = z.object({
  from: z.string(),
  to: z.string(),
  rows: z.array(mizanRow),
  totals: z.object({
    debitMinor: moneyMinor,
    creditMinor: moneyMinor,
    /** Devir borç bakiyeleri toplamı = devir alacak bakiyeleri toplamı. */
    openingDebitMinor: moneyMinor,
    openingCreditMinor: moneyMinor,
  }),
});

/* ------------------------------------------------------------------ *
 * Yevmiye defteri
 * ------------------------------------------------------------------ */

export const journalQuery = mizanQuery;

export const journalEntryRow = z.object({
  no: z.number().int(),
  date: z.string(),
  source: z.string(),
  sourceId: z.string().nullable(),
  description: z.string(),
  lines: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      debitMinor: moneyMinor,
      creditMinor: moneyMinor,
    }),
  ),
});

export const journalResponse = z.object({
  from: z.string(),
  to: z.string(),
  entries: z.array(journalEntryRow),
  /** Aralıktaki toplam fiş sayısı (liste en çok `limit` kadar döner). */
  total: z.number().int(),
  limit: z.number().int(),
  totals: z.object({ debitMinor: moneyMinor, creditMinor: moneyMinor }),
});
export type JournalResponse = z.infer<typeof journalResponse>;

/* ------------------------------------------------------------------ *
 * Açılış fişi
 * ------------------------------------------------------------------ */

/**
 * `GET/PUT /v1/panel/reports/accounting/opening`.
 *
 * Sisteme geçiş tarihindeki bakiyeler: kasa, banka hesapları, tedarikçilere
 * borç, personel (maaş borcu / avans) ve sakinlerin devir borçları. Sakin
 * devir borcu **gerçek borç** olarak açılıyor (tahsil edilebilsin); kısmen
 * ödenmiş devir borcu kilitli (değiştirilemez).
 */
export const openingSave = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cashMinor: z.coerce.number().int().min(0).default(0),
  banks: z.array(z.object({ bankAccountId: uuid, amountMinor: z.coerce.number().int().min(0) })).default([]),
  vendors: z.array(z.object({ vendorId: uuid, amountMinor: z.coerce.number().int().min(0) })).default([]),
  staff: z
    .array(
      z.object({
        staffId: uuid,
        payableMinor: z.coerce.number().int().min(0),
        advanceMinor: z.coerce.number().int().min(0),
      }),
    )
    .default([]),
  units: z.array(z.object({ unitId: uuid, amountMinor: z.coerce.number().int().min(0) })).default([]),
});
export type OpeningSave = z.infer<typeof openingSave>;

export const openingResponse = z.object({
  asOf: z.string().nullable(),
  cashMinor: moneyMinor,
  banks: z.array(z.object({ bankAccountId: uuid, label: z.string(), amountMinor: moneyMinor })),
  vendors: z.array(z.object({ vendorId: uuid, name: z.string(), amountMinor: moneyMinor })),
  staff: z.array(
    z.object({ staffId: uuid, name: z.string(), payableMinor: moneyMinor, advanceMinor: moneyMinor }),
  ),
  units: z.array(
    z.object({
      unitId: uuid,
      label: z.string(),
      amountMinor: moneyMinor,
      /** Devir borcuna tahsilat yapılmışsa tutar artık değiştirilemez. */
      locked: z.boolean(),
    }),
  ),
  /** Fişin dengeleyicisi: varlıklar − borçlar (549 Özel fonlar). */
  equityMinor: moneyMinor,
});
export type OpeningResponse = z.infer<typeof openingResponse>;

export const openingSaveResult = z.object({
  asOf: z.string(),
  unitsCreated: z.number().int(),
  unitsUpdated: z.number().int(),
  unitsLocked: z.number().int(),
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
