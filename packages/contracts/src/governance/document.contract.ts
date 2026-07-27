import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * `governance` bağlamının okuma yüzeyleri — belge, hukuk, KVKK
 * (MIMARI-PLAN §6.3). Denetim kütüğü `audit.contract.ts` içinde.
 */

/* ------------------------------------------------------------------ *
 * Belgeler
 * ------------------------------------------------------------------ */

export const documentRow = z.object({
  id: uuid,
  category: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  version: z.number().int(),
  visibility: z.string(),
  expiresAt: dateTime.nullable(),
  /** Süresi dolmuş mu — sunucu saatine göre. */
  expired: z.boolean(),
  /** 30 gün içinde doluyor mu; ekran uyarı tonunu buna göre seçiyor. */
  expiringSoon: z.boolean(),
  createdAt: dateTime,
});

export const documentListResponse = z.object({
  rows: z.array(documentRow),
  totals: z.object({
    total: z.number().int(),
    expiringSoon: z.number().int(),
    expired: z.number().int(),
  }),
});

export type DocumentListResponse = z.infer<typeof documentListResponse>;

/* ------------------------------------------------------------------ *
 * Hukuk / icra takibi
 * ------------------------------------------------------------------ */

export const legalCaseRow = z.object({
  id: uuid,
  unitId: uuid.nullable(),
  unitNumber: z.string().nullable(),
  caseNo: z.string().nullable(),
  stage: z.string(),
  principalMinor: moneyMinor,
  interestMinor: moneyMinor,
  costsMinor: moneyMinor,
  collectedMinor: moneyMinor,
  /**
   * Tahsil edilebilirlik puanı (0–100) ve dayandığı etkenler. Puanın tek
   * başına dönmesi yetmez: icra kararı verirken yöneticinin **neden** o
   * puan olduğunu görmesi gerekiyor (SPEC 9.3 — açıklanabilirlik).
   */
  collectionScore: z.number().int().nullable(),
  scoreFactors: z.unknown().nullable(),
  nextActionAt: dateTime.nullable(),
  nextActionNote: z.string().nullable(),
  openedAt: dateTime,
  closedAt: dateTime.nullable(),
});

/**
 * İcra takibi **adayı** — henüz dosya açılmamış ama eşiği aşmış birimler.
 *
 * Listede birim **numarası** var; eski ekran yalnız id'nin ilk 8 karakterini
 * gösterebiliyordu çünkü sorgu `units` ile join'lenmemişti. Yönetici "hangi
 * daire" sorusunu id parçasıyla cevaplayamaz.
 */
export const legalCandidateRow = z.object({
  unitId: uuid,
  unitNumber: z.string().nullable(),
  blockName: z.string().nullable(),
  totalMinor: moneyMinor,
  oldestDue: dateTime.nullable(),
  debtCount: z.number().int(),
});

export const legalCaseListResponse = z.object({
  rows: z.array(legalCaseRow),
  candidates: z.array(legalCandidateRow),
  /** İcra eşiği (gün) — ekrandaki açıklama metni için. */
  thresholdDays: z.number().int(),
  totals: z.object({
    open: z.number().int(),
    closed: z.number().int(),
    principalMinor: moneyMinor,
    collectedMinor: moneyMinor,
  }),
});

export type LegalCaseListResponse = z.infer<typeof legalCaseListResponse>;

/* ------------------------------------------------------------------ *
 * KVKK başvuruları
 * ------------------------------------------------------------------ */

export const kvkkRequestRow = z.object({
  id: uuid,
  type: z.string(),
  status: z.string(),
  requesterEmail: z.string().nullable(),
  detail: z.string().nullable(),
  dueAt: dateTime.nullable(),
  fulfilledAt: dateTime.nullable(),
  responseNote: z.string().nullable(),
  /**
   * Yasal süre aşıldı mı — KVKK md.13: 30 gün. Sunucu saatine göre; bu bir
   * uyum göstergesi ve tarayıcı saatine bırakılamaz.
   */
  overdue: z.boolean(),
  createdAt: dateTime,
});

/**
 * KVKK uyum risk puanı.
 *
 * Puanlama `packages/kvkk` içindeki saf fonksiyonla yapılıyor ama
 * **girdilerinin hepsi** veritabanından geliyor (rıza kapsamı, geciken
 * başvuru sayısı, işaretlenmiş duyuru, MFA durumu). Bu yüzden hesap
 * sunucuda: ekranın aynı sayıyı üretebilmesi için önce beş ayrı sorgunun
 * sonucunu taşımak gerekirdi.
 *
 * `issues` kodları çeviriye map'leniyor (SPEC 4.2 — paketler dile bağımsız).
 */
export const kvkkRiskResult = z.object({
  score: z.number().int(),
  level: z.string(),
  issues: z.array(
    z.object({
      code: z.string(),
      weight: z.number().int(),
      params: z.record(z.number()).optional(),
    }),
  ),
});

export const kvkkOverviewResponse = z.object({
  requests: z.array(kvkkRequestRow),
  risk: kvkkRiskResult,
  /**
   * Silme planı — KVKK md.7 talebinde hangi alanın silineceği, hangisinin
   * anonimleştirileceği, hangisinin **yasal zorunlulukla saklanacağı**.
   * Son grup kritik: "her şeyi sildik" demek mali mevzuata aykırı olurdu.
   */
  erasurePlan: z.object({
    deletable: z.array(z.string()),
    anonymizable: z.array(
      z.object({ field: z.string(), reasonKey: z.string() }),
    ),
    retained: z.array(
      z.object({
        table: z.string(),
        reasonKey: z.string(),
        untilKey: z.enum(["date", "indefinite", "days"]),
        untilValue: z.union([z.string(), z.number()]).optional(),
      }),
    ),
  }),
  totals: z.object({
    open: z.number().int(),
    overdue: z.number().int(),
    fulfilled: z.number().int(),
    /** Aydınlatma/açık rıza kaydı sayısı — kanıtın varlığı. */
    consentCount: z.number().int(),
    /** KVKK tarayıcısının işaretlediği duyuru sayısı. */
    flaggedAnnouncements: z.number().int(),
    /** Açık rıza kapsama oranı (0–1). */
    consentCoverage: z.number(),
  }),
});

export type KvkkOverviewResponse = z.infer<typeof kvkkOverviewResponse>;
