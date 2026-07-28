import { z } from "zod";

import { changeReason, dateTime, moneyMinor, uuid } from "../_shared/fields";
import { listQuery, option, pageMeta } from "../_shared/list";

/**
 * Borç sözleşmesi — MIMARI-PLAN §6.4 `debt`.
 *
 * İki ürün kuralı burada **protokol seviyesinde** yaşıyor:
 *  - gerekçesiz düzeltme yok (GAP-DURUM kararı 9): `reason` en az 10 karakter,
 *    ve `X-Change-Reason` başlığı da aynı metni taşıyor;
 *  - yıkıcı işlemde önizleme zorunlu (karar 8): toplu borçlandırma
 *    `confirmed: false` ile yazmaz.
 *
 * Para her yerde **kuruş** (`moneyMinor`) — float yok.
 */

/**
 * Borç türleri — `packages/db` `debt_kind` enum'unun birebir karşılığı.
 *
 * Son üçü 2026-07-28 rakip incelemesinde doğrulandığı için eklendi; gerekçe
 * `packages/db/src/schema/enums.ts` ve `0003_debt_kinds.sql` içinde.
 */
export const DEBT_KINDS = [
  "dues",
  "utility",
  "reservation",
  "penalty",
  "late_fee",
  "extra",
  "legal_cost",
  "rent",
  "deposit",
  "admin_fine",
] as const;
export const debtKind = z.enum(DEBT_KINDS);

export type DebtKind = (typeof DEBT_KINDS)[number];

/**
 * Formda **elle seçilebilen** türler.
 *
 * `late_fee` dışarıda: gecikme tazminatı borcunu yönetici yazmaz, gecikme işi
 * (`debt.lateFee`) hesaplayıp yazar. Seçenek olarak sunmak aynı kalemin iki
 * farklı yoldan doğmasına ve toplamların uyuşmamasına yol açardı.
 *
 * Bu liste daha önce **üç ekranda ayrı ayrı** yazılıydı (`borclar/page.tsx`,
 * `borclar/actions.ts`, `yeni/debt-form.tsx`) ve üçü birbirinden farklıydı:
 * filtre `late_fee`yi listeliyor, form listelemiyordu. Tek kaynağa indirildi.
 *
 * `filter(...)` ile türetilemiyor çünkü `z.enum` boş olmayan bir **tuple**
 * istiyor; `filter` dizi döner. Bunun yerine aşağıdaki iki tip iddiası
 * listelerin birbirinden kaymasını **derleme zamanında** yakalıyor.
 */
export const MANUAL_DEBT_KINDS = [
  "dues",
  "utility",
  "reservation",
  "penalty",
  "extra",
  "legal_cost",
  "rent",
  "deposit",
  "admin_fine",
] as const;

export const manualDebtKind = z.enum(MANUAL_DEBT_KINDS);

/** `MANUAL_DEBT_KINDS ⊆ DEBT_KINDS \ {late_fee}` — fazlalık varsa tip hatası. */
type _ManualKindsAreValid =
  (typeof MANUAL_DEBT_KINDS)[number] extends Exclude<DebtKind, "late_fee">
    ? true
    : never;
/** `DEBT_KINDS \ {late_fee} ⊆ MANUAL_DEBT_KINDS` — eksik varsa tip hatası. */
type _ManualKindsAreComplete =
  Exclude<DebtKind, "late_fee"> extends (typeof MANUAL_DEBT_KINDS)[number]
    ? true
    : never;

// Tipler yalnız kısıt taşıyor; `void` ile kullanılmayan-tip uyarısı önleniyor.
export type ManualDebtKindInvariants = [
  _ManualKindsAreValid,
  _ManualKindsAreComplete,
];

/**
 * **Toplu** borçlandırma sihirbazında sunulan türler.
 *
 * Elle seçilebilenlerin bir alt kümesi, çünkü toplu borçlandırma tanımı gereği
 * "aynı kalemi çok daireye formülle dağıtmak". Bu kalıba uymayan türler
 * sunulmuyor:
 *  - `rent` — ortak alan kirası **tek** kiracıdan alınan gelirdir, dairelere
 *    dağıtılan bir borç değil;
 *  - `deposit` — depozito kişiye özel ve tek seferlik;
 *  - `reservation` — rezervasyon bedeli rezervasyonu yapana yazılır;
 *  - `legal_cost` — takibi yapılan daireye yazılır, hepsine değil.
 *
 * `admin_fine` **dahil**: kamu kurumunun siteye kestiği ceza tam olarak
 * dairelere arsa payı/eşit formülüyle dağıtılan bir kalemdir (KMK md.20).
 *
 * Uç bu listeyi zorlamıyor (`debtBulkCreate.kind` tüm türleri kabul eder) —
 * bu bir ekran affordance'ı, güvenlik sınırı değil.
 */
export const BULK_DEBT_KINDS = [
  "dues",
  "utility",
  "extra",
  "penalty",
  "admin_fine",
] as const;

export type BulkDebtKind = (typeof BULK_DEBT_KINDS)[number];

/**
 * Borcun kime yazılacağı — GAP 4.1.3 "borç paylaşımı seçimi".
 *
 * `split` (yarı yarıya) ve `share` (hisseye göre) tek bir `debtorUserId`
 * alanına sığmaz; bunlar **birden fazla borç kaydı** üretir. Tek kayıt üretip
 * "yarısı şunun" demek cari hesapları ve tahsilat mahsubunu bozardı.
 */
export const SHARE_TARGETS = ["owner", "tenant", "split", "share"] as const;
export const shareTarget = z.enum(SHARE_TARGETS);

export const DUES_FORMULAS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "custom",
] as const;
export const duesFormula = z.enum(DUES_FORMULAS);

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "card",
  "credit_balance",
  "offset",
] as const;
export const paymentMethod = z.enum(PAYMENT_METHODS);

export const DEBT_SORT_KEYS = [
  "dueDate",
  "amount",
  "unit",
  "period",
  "status",
  "createdAt",
] as const;
export const debtSort = z.enum(DEBT_SORT_KEYS);

/* ------------------------------------------------------------------ *
 * Liste
 * ------------------------------------------------------------------ */

/**
 * "Riskli cari" eşikleri — kuruş cinsinden kalan borç alt sınırları.
 *
 * Rakip incelemesinde (Yönetimcell, 2026-07-28) canlı doğrulandı: yöneticinin
 * asıl sorusu "kim borçlu" değil, **"kimi arayacak kadar borçlu"**. Serbest
 * tutar kutusu yerine hazır eşik sunuluyor çünkü bu bir arama değil, tek tıkla
 * ulaşılması gereken bir çalışma listesi — her seferinde "500" yazdırmak
 * filtreyi kullanılmaz hale getirirdi.
 *
 * Eşikler **kuruş** (para her yerde kuruş, float yok). 500 ₺ = 50_000 kuruş.
 */
export const RISK_THRESHOLDS_MINOR = [
  50_000, 100_000, 200_000, 500_000,
] as const;

export const debtListQuery = listQuery.extend({
  sort: debtSort.default("dueDate"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  blockId: uuid.optional(),
  period: z.string().max(7).optional(),
  kind: debtKind.optional(),
  status: z
    .enum(["all", "acik", "gecikmis", "odendi", "taksit"])
    .default("all"),
  /**
   * Kalan borç alt sınırı (kuruş) — `>=` karşılaştırması.
   *
   * Serbest sayı kabul ediliyor (yalnız `RISK_THRESHOLDS_MINOR` değil): uç
   * dışarıya da açık ve sabit bir listeye kilitlemek API tüketicisini
   * gereksiz kısıtlardı. Ekran hazır eşikleri sunuyor, uç eşiği doğruluyor.
   */
  minOutstanding: z.coerce.number().int().min(0).optional(),
});

export type DebtListQuery = z.infer<typeof debtListQuery>;

export const debtRow = z.object({
  id: uuid,
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  debtorUserId: uuid.nullable(),
  debtorName: z.string().nullable(),
  kind: z.string(),
  description: z.string(),
  period: z.string().nullable(),
  amountMinor: moneyMinor,
  paidMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  outstandingMinor: moneyMinor,
  dueDate: dateTime,
  status: z.string(),
  lateFeeExempt: z.boolean(),
  installmentNo: z.number().int().nullable(),
  installmentCount: z.number().int().nullable(),
  /** Bu borcun değişiklik kaydı var mı — listede şeffaflık işareti (SPEC 3.2). */
  changeCount: z.number().int(),
});

export type DebtRow = z.infer<typeof debtRow>;

export const debtListResponse = z.object({
  rows: z.array(debtRow),
  meta: pageMeta,
  facets: z.object({
    blocks: z.array(option),
    periods: z.array(z.string()),
  }),
  /** Özet toplamlar filtreden bağımsız: yönetici genel durumu görsün. */
  totals: z.object({
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    lateFeeMinor: moneyMinor,
    collectedMinor: moneyMinor,
  }),
});

export type DebtListResponse = z.infer<typeof debtListResponse>;

/* ------------------------------------------------------------------ *
 * Detay
 * ------------------------------------------------------------------ */

export const debtChangeEntry = z.object({
  id: uuid,
  changeType: z.string(),
  oldAmountMinor: moneyMinor.nullable(),
  newAmountMinor: moneyMinor.nullable(),
  oldDueDate: dateTime.nullable(),
  newDueDate: dateTime.nullable(),
  changedByName: z.string().nullable(),
  reason: z.string().nullable(),
  visibleToResident: z.boolean(),
  createdAt: dateTime,
});

export const debtDetail = z.object({
  debt: z.object({
    id: uuid,
    unitId: uuid,
    debtorUserId: uuid.nullable(),
    duesPlanId: uuid.nullable(),
    kind: z.string(),
    description: z.string(),
    period: z.string().nullable(),
    amountMinor: moneyMinor,
    paidMinor: moneyMinor,
    lateFeeMinor: moneyMinor,
    dueDate: dateTime,
    status: z.string(),
    lateFeeExempt: z.boolean(),
    installmentNo: z.number().int().nullable(),
    installmentCount: z.number().int().nullable(),
    metadata: z.record(z.unknown()).default({}),
    createdAt: dateTime,
    deletedAt: dateTime.nullable(),
  }),
  unit: z.object({
    id: uuid,
    number: z.string(),
    blockName: z.string().nullable(),
  }),
  debtorName: z.string().nullable(),
  planName: z.string().nullable(),
  /** Append-only değişiklik tarihçesi — SPEC 3.2 şeffaflık. */
  changes: z.array(debtChangeEntry),
  allocations: z.array(
    z.object({
      paymentId: uuid,
      amountMinor: moneyMinor,
      paidAt: dateTime.nullable(),
      method: z.string(),
      receiptNo: z.string().nullable(),
      payerName: z.string().nullable(),
    }),
  ),
  /** Aynı taksit planındaki kardeş borçlar. */
  siblings: z.array(
    z.object({
      id: uuid,
      installmentNo: z.number().int().nullable(),
      amountMinor: moneyMinor,
      paidMinor: moneyMinor,
      dueDate: dateTime,
      status: z.string(),
    }),
  ),
});

export type DebtDetail = z.infer<typeof debtDetail>;

/* ------------------------------------------------------------------ *
 * Yazma — tek borç
 * ------------------------------------------------------------------ */

export const debtCreate = z.object({
  unitId: uuid,
  kind: debtKind,
  description: z.string().trim().min(3).max(200),
  amountMinor: z.coerce.number().int().positive(),
  dueDate: dateTime,
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  shareTarget,
  lateFeeExempt: z.coerce.boolean().default(false),
  /** 1 = tek seferlik; >1 taksitlendirir ve vadeler ay ay ileri kayar. */
  installmentCount: z.coerce.number().int().min(1).max(36).default(1),
  notes: z.string().trim().max(1000).optional(),
});

export type DebtCreate = z.infer<typeof debtCreate>;

export const debtCreateResult = z.object({
  ids: z.array(uuid),
  unitNumber: z.string(),
});

export type DebtCreateResult = z.infer<typeof debtCreateResult>;

/* ------------------------------------------------------------------ *
 * Yazma — toplu borçlandırma
 * ------------------------------------------------------------------ */

export const debtBulkCreate = z.object({
  description: z.string().trim().min(3).max(200),
  kind: debtKind,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  dueDay: z.coerce.number().int().min(1).max(28),
  formula: duesFormula,
  /** `equal`: birim başı tutar; diğerleri: dağıtılacak havuz. */
  amountMinor: z.coerce.number().int().positive(),
  shareTarget,
  /** Boş = tüm bloklar. */
  blockIds: z.array(uuid).default([]),
  unitTypes: z.array(z.string()).default([]),
  skipExisting: z.coerce.boolean().default(true),
  lateFeeExempt: z.coerce.boolean().default(false),
});

export type DebtBulkCreate = z.infer<typeof debtBulkCreate>;

export const debtBulkPreviewRow = z.object({
  unitId: uuid,
  unitNumber: z.string(),
  blockName: z.string().nullable(),
  amountMinor: moneyMinor,
  exempt: z.boolean(),
  alreadyExists: z.boolean(),
});

export const debtBulkPreview = z.object({
  rows: z.array(debtBulkPreviewRow),
  /** Atlanacaklar düşülmüş net toplam. */
  totalMinor: moneyMinor,
});

export type DebtBulkPreview = z.infer<typeof debtBulkPreview>;

export const debtBulkResult = z.object({
  createdCount: z.number().int(),
  skippedCount: z.number().int(),
  totalMinor: moneyMinor,
});

export type DebtBulkResult = z.infer<typeof debtBulkResult>;

/* ------------------------------------------------------------------ *
 * Yazma — düzeltme, tahsilat, toplu işlem
 * ------------------------------------------------------------------ */

/**
 * Borç tutarı/vadesi düzeltme — GAP-DURUM kararı 9.
 *
 * Gerekçe **gövdede** taşınıyor (başlıkta da gidiyor): `audit_debt_changes`
 * sakine gösterilebilen bir metin saklıyor ve o metin denetim kütüğündekiyle
 * aynı olmalı. İki ayrı alan olsaydı ayrışabilirlerdi.
 */
export const debtAdjust = z.object({
  amountMinor: z.coerce.number().int().min(0),
  dueDate: dateTime,
  reason: changeReason,
  visibleToResident: z.coerce.boolean().default(true),
  lateFeeExempt: z.coerce.boolean().default(false),
});

export type DebtAdjust = z.infer<typeof debtAdjust>;

export const paymentCollect = z.object({
  unitId: uuid,
  amountMinor: z.coerce.number().int().positive(),
  method: paymentMethod,
  paidAt: dateTime,
  payerUserId: uuid.optional(),
  receiptNo: z.string().trim().max(30).optional(),
  /** Belirli borçlara öncelik; boşsa en eski vade önce. */
  debtIds: z.array(uuid).default([]),
  note: z.string().trim().max(500).optional(),
});

export type PaymentCollect = z.infer<typeof paymentCollect>;

export const paymentCollectResult = z.object({
  paymentId: uuid,
  allocatedMinor: moneyMinor,
  /** Borcu aşan kısım — sessizce yutulmaz, yöneticiye bildirilir. */
  creditBalanceMinor: moneyMinor,
  closedDebtCount: z.number().int(),
});

export type PaymentCollectResult = z.infer<typeof paymentCollectResult>;

/** Borç iptali — gerekçe zorunlu, ödenmiş borç iptal edilemez. */
export const debtCancel = z.object({
  ids: z.array(uuid).min(1),
  reason: changeReason,
});

export const debtExemptPatch = z.object({
  ids: z.array(uuid).min(1),
  exempt: z.coerce.boolean(),
});

export const debtBulkResultSimple = z.object({
  affected: z.number().int(),
  requested: z.number().int(),
});

export type DebtBulkResultSimple = z.infer<typeof debtBulkResultSimple>;

/** Bir birimin açık borçları — tahsilat formu için. */
export const openDebtRow = z.object({
  id: uuid,
  description: z.string(),
  period: z.string().nullable(),
  amountMinor: moneyMinor,
  paidMinor: moneyMinor,
  lateFeeMinor: moneyMinor,
  dueDate: dateTime,
});

export const openDebtList = z.object({ rows: z.array(openDebtRow) });
export type OpenDebtList = z.infer<typeof openDebtList>;

/** Son borç değişiklikleri — denetim ekranı ve dashboard şeffaflık göstergesi. */
export const debtChangeFeedRow = z.object({
  id: uuid,
  debtId: uuid,
  unitId: uuid.nullable(),
  unitNumber: z.string().nullable(),
  changeType: z.string(),
  oldAmountMinor: moneyMinor.nullable(),
  newAmountMinor: moneyMinor.nullable(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: dateTime,
});

export const debtChangeFeed = z.object({ rows: z.array(debtChangeFeedRow) });
export type DebtChangeFeed = z.infer<typeof debtChangeFeed>;

/**
 * Daire özeti görünümü — borçlar ekranının ikinci sekmesi (satır = daire).
 * Liste ve özet ayrı sayfa olsaydı yönetici hangisinde olduğunu takip etmek
 * zorunda kalırdı; sekme yeterli.
 */
export const unitDebtSummaryRow = z.object({
  unitId: uuid,
  number: z.string(),
  blockName: z.string().nullable(),
  outstandingMinor: moneyMinor,
  overdueMinor: moneyMinor,
  oldestDue: dateTime.nullable(),
  debtCount: z.number().int(),
  /**
   * Son 6 ayın ay sonu kalan borcu (eskiden yeniye, kuruş) — satır içi
   * bakiye trendi (rakip incelemesi §4.3).
   *
   * NEDEN SUNUCUDA: seri, ödemelerin **tahsil tarihine** göre geriye doğru
   * kurulan bir zaman serisi; satırdaki tek "kalan borç" sayısından
   * türetilemez. İstemciye 6 ay × N daire ham hareket göndermek yerine
   * altı sayı gönderiliyor.
   *
   * Uzunluk sabit (`TREND_MONTHS`): değişken uzunluk, grafiklerin x eksenini
   * satırdan satıra kaydırıp karşılaştırmayı imkânsız kılardı.
   */
  trendMinor: z.array(moneyMinor),
});

/** Bakiye trendinde gösterilen ay sayısı — sözleşme ve ekran aynı sayıyı kullanır. */
export const TREND_MONTHS = 6;

/**
 * Daire özeti sorgusu.
 *
 * `minOutstanding` borç listesindekiyle **aynı anlamda**: kalan borcu bu
 * eşiğin altında kalan daire hiç dönmez. İki görünümde farklı davranan bir
 * filtre, sekme değiştiren yöneticiye sessizce farklı bir liste gösterirdi.
 */
export const unitDebtSummaryQuery = z.object({
  minOutstanding: z.coerce.number().int().min(0).optional(),
});

export type UnitDebtSummaryQuery = z.infer<typeof unitDebtSummaryQuery>;

export const unitDebtSummary = z.object({ rows: z.array(unitDebtSummaryRow) });
export type UnitDebtSummary = z.infer<typeof unitDebtSummary>;

/* ------------------------------------------------------------------ *
 * Borcu yoktur belgesi — GAP 4.1.9
 * ------------------------------------------------------------------ */

/**
 * Belge, verildiği **an**ın fotoğrafıdır: `asOfDate` ve `outstandingMinor`
 * kaydediliyor ki sonradan borç doğsa bile belgenin ne söylediği tartışmalı
 * olmasın. `verificationCode` ile üçüncü taraf (tapu, banka) belgenin
 * gerçekliğini `/belge/dogrula` üzerinden sınayabiliyor.
 */
export const debtCertificateRow = z.object({
  id: uuid,
  unitId: uuid,
  unitNumber: z.string().nullable(),
  result: z.string(),
  outstandingMinor: moneyMinor,
  asOfDate: dateTime,
  serialNo: z.string(),
  pdfUrl: z.string().nullable(),
  kepRecipient: z.string().nullable(),
  kepSentAt: dateTime.nullable(),
  verificationCode: z.string(),
  createdAt: dateTime,
});

export const debtCertificateListResponse = z.object({
  rows: z.array(debtCertificateRow),
  totals: z.object({
    clean: z.number().int(),
    withDebt: z.number().int(),
    kepSent: z.number().int(),
  }),
});

export type DebtCertificateListResponse = z.infer<
  typeof debtCertificateListResponse
>;

export const debtCertificateIssue = z.object({
  unitNumber: z.string().trim().min(1).max(20),
  kepRecipient: z.string().trim().max(160).nullish(),
});

export type DebtCertificateIssue = z.infer<typeof debtCertificateIssue>;

export const debtCertificateIssueResult = z.object({
  serialNo: z.string(),
  verificationCode: z.string(),
  result: z.enum(["clear", "outstanding"]),
  outstandingMinor: moneyMinor,
  unitLabel: z.string(),
  asOfDate: dateTime,
});

export type DebtCertificateIssueResult = z.infer<
  typeof debtCertificateIssueResult
>;

/* ------------------------------------------------------------------ *
 * Belge doğrulama (halka açık)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/public/certificates/verify` — banka/kurum teyidi (SPEC 3.6).
 *
 * Kimlik doğrulaması yok ve olmamalı: belgeyi ibraz eden kişi karşı tarafa
 * hesap açtıramaz. Buna karşılık yanıt **kişisel veri taşımıyor** — daire
 * numarası, sakin adı, borç kalemleri yok. Dönen tek şey "bu belge gerçek mi,
 * hangi site verdi, ne zaman ve sonuç neydi".
 *
 * Seri numarası + doğrulama kodu **birlikte** aranıyor: yalnız seri numarası
 * tahmin edilebilir (sıralı), kod ise değil.
 */
export const certificateVerifyResult = z.discriminatedUnion("valid", [
  z.object({ valid: z.literal(false) }),
  z.object({
    valid: z.literal(true),
    tenantName: z.string(),
    asOfDate: dateTime,
    result: z.enum(["clear", "outstanding"]),
    outstandingMinor: moneyMinor,
  }),
]);

export type CertificateVerifyResult = z.infer<typeof certificateVerifyResult>;

/* ------------------------------------------------------------------ *
 * Sakin ödemesi (hosted checkout)
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/portal/payment` — ödeme özeti (SPEC 1.2 / 7.1).
 *
 * Komisyon kırılımı **sunucudan** geliyor, ekranda hesaplanmıyor: gösterilen
 * tutarla tahsil edilen tutar arasında bir kuruş fark, şeffaflık vaadini
 * (Bölüm 1.2) bozardı. İki yerde hesaplamak o farkın kaçınılmaz yolu.
 */
export const portalPaymentSummary = z.object({
  unit: z.object({ id: uuid, number: z.string() }).nullable(),
  tenantName: z.string(),
  items: z.array(
    z.object({ id: uuid, description: z.string(), outstandingMinor: moneyMinor }),
  ),
  fees: z.object({
    amountMinor: moneyMinor,
    platformFeeMinor: moneyMinor,
    processorFeeMinor: moneyMinor,
    totalMinor: moneyMinor,
    /** Komisyonu kim üstleniyor — ekrandaki bilgi notunu bu belirliyor. */
    paidBy: z.enum(["management", "resident"]),
  }),
});

export type PortalPaymentSummary = z.infer<typeof portalPaymentSummary>;

/**
 * `POST /v1/panel/portal/payment` — ödeme başlatır.
 *
 * Gövde **boş**: tutar da daire de sunucuda, açık borçlardan türetiliyor.
 * İstemciden tutar almak, ödenecek miktarı istemcinin belirlemesi demekti.
 */
export const portalCheckoutResult = z.object({
  /** Hosted checkout adresi — kart verisi hiçbir zaman bize gelmiyor (PCI-DSS). */
  paymentPageUrl: z.string().nullable(),
  /** Sağlayıcı yapılandırılmamışsa havale talimatına düşülür. */
  fallback: z.enum(["bank_transfer"]).nullable(),
  conversationId: z.string(),
});

export type PortalCheckoutResult = z.infer<typeof portalCheckoutResult>;
