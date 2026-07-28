import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * Karar Defteri — KMK md.32.
 *
 * Rakip incelemesinde (Dijiyon + Yönetimcell, 2026-07-28) **her ikisinde de**
 * canlı doğrulandı. Mevcut `meeting_decisions` bunun yerine geçmiyor; gerekçe
 * `packages/db/src/schema/compliance.ts` ve `0006_decision_book.sql` içinde.
 *
 * DEFTER EKLEME-YALNIZ: karar metni yazıldıktan sonra değişmiyor (veritabanı
 * trigger'ı da engelliyor). Yanlış karar düzeltilmez; düzelten yeni bir karar
 * yazılır ve eskisine işaret eder.
 */

/**
 * Karar türü.
 *  - `kurul`   — kat malikleri kurulu toplantısı kararı
 *  - `yazili`  — toplantı yapılmaksızın **oybirliğiyle** alınan karar (md.32/son)
 *  - `yonetim` — yönetici / yönetim kurulu kararı
 */
export const DECISION_KINDS = ["kurul", "yazili", "yonetim"] as const;
export const decisionKind = z.enum(DECISION_KINDS);

export const DECISION_QUORUM_RULES = [
  "simple_majority",
  "absolute_majority",
  "two_thirds",
  "four_fifths",
  "unanimous",
] as const;
export const decisionQuorumRule = z.enum(DECISION_QUORUM_RULES);

export const decisionEntryRow = z.object({
  id: uuid,
  /** Site genelinde sürekli defter sıra numarası. */
  entryNo: z.number().int(),
  decidedAt: dateTime,
  kind: z.string(),
  meetingId: uuid.nullable(),
  meetingTitle: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  quorumRule: z.string(),
  /**
   * Oy değerleri **metin** olarak taşınıyor.
   *
   * Arsa payı ağırlıklı oylamada değer kesirli (`numeric(12,6)`) ve bunu
   * `number`a çevirmek kayan nokta yuvarlaması demek. Karar defteri hukuki
   * bir belge; "312,5 arsa payı kabul" yazan yerde 312,499999 görünmesi
   * kabul edilebilir değil.
   */
  votesFor: z.string(),
  votesAgainst: z.string(),
  abstentions: z.string(),
  passed: z.boolean(),
  correctsEntryId: uuid.nullable(),
  /** Bu kararı düzelten sonraki kararın numarası — varsa ekran uyarı basar. */
  correctedByEntryNo: z.number().int().nullable(),
  bookPageNo: z.number().int().nullable(),
  createdByName: z.string().nullable(),
  createdAt: dateTime,
});

export type DecisionEntryRow = z.infer<typeof decisionEntryRow>;

export const decisionBookQuery = z.object({
  /** Yıl filtresi — defter yıl yıl okunuyor (dosyalama böyle). */
  year: z.coerce.number().int().min(1950).max(2200).optional(),
  kind: decisionKind.optional(),
});

export type DecisionBookQuery = z.infer<typeof decisionBookQuery>;

export const decisionBookResponse = z.object({
  rows: z.array(decisionEntryRow),
  /** Filtre kutusunu doldurmak için — defterde karar bulunan yıllar. */
  years: z.array(z.number().int()),
  /** Toplantı seçenekleri: kararı bir toplantıya bağlamak için (§9a). */
  meetings: z.array(
    z.object({ id: uuid, title: z.string(), scheduledAt: dateTime }),
  ),
  totals: z.object({
    entries: z.number().int(),
    passed: z.number().int(),
    rejected: z.number().int(),
    /** Sonradan düzeltilmiş karar sayısı — defterin sağlığı göstergesi. */
    corrected: z.number().int(),
  }),
  /** Sıradaki defter numarası — form bunu önceden gösterir. */
  nextEntryNo: z.number().int(),
});

export type DecisionBookResponse = z.infer<typeof decisionBookResponse>;

/**
 * Deftere karar yazma.
 *
 * `entryNo` **istemciden alınmıyor**: numarayı sunucu veriyor. İstemcinin
 * numara önermesi, iki yöneticinin aynı anda kayıt açtığında aynı numarayı
 * yazmasına ya da numara atlamasına yol açardı; atlanan numara defterde
 * yırtılmış sayfa gibi okunur.
 *
 * `id` de yok — **güncelleme ucu yok**. Defter ekleme-yalnız.
 */
export const decisionEntryCreate = z.object({
  decidedAt: dateTime,
  kind: decisionKind,
  meetingId: uuid.nullish(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(20_000),
  quorumRule: decisionQuorumRule.default("simple_majority"),
  /**
   * Oylar metin: arsa payı ağırlıklı oy kesirli olabiliyor ve `number`
   * üzerinden geçirmek yuvarlama kaybı demek (bkz. `decisionEntryRow`).
   */
  votesFor: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,6})?$/)
    .default("0"),
  votesAgainst: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,6})?$/)
    .default("0"),
  abstentions: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,6})?$/)
    .default("0"),
  passed: z.coerce.boolean().default(true),
  /** Düzeltilen kararın kimliği — düzeltme kaydıysa dolu. */
  correctsEntryId: uuid.nullish(),
  bookPageNo: z.coerce.number().int().min(1).max(100_000).nullish(),
});

export type DecisionEntryCreate = z.infer<typeof decisionEntryCreate>;

export const decisionEntryCreateResult = z.object({
  id: uuid,
  entryNo: z.number().int(),
});

export type DecisionEntryCreateResult = z.infer<
  typeof decisionEntryCreateResult
>;
