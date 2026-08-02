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
  /**
   * Dosya yüklenebiliyor mu — depo kurulu değilse ekran yükleme kutusunu hiç
   * göstermiyor. Devre dışı bir düğme "belki çalışır" izlenimi verirdi.
   */
  uploadEnabled: z.boolean(),
});

/* --------------------------------------------------------- yükleme */

export const documentCategory = z.enum([
  "contract", "license", "meeting_minutes", "invoice", "maintenance_report",
  "management_plan", "insurance", "legal", "kvkk", "identity", "other",
]);

/**
 * Görünürlük — belgeyi kimin okuyabileceği.
 *
 * `managers` varsayılan: yanlış seçilen bir görünürlük, kimlik fotokopisini
 * ya da sözleşmeyi sakine açmak demek. Unutulduğunda güvenli tarafa düşen
 * varsayılan bu.
 */
export const documentVisibility = z.enum(["managers", "owners", "residents"]);

/**
 * 1. adım: yükleme adresi iste.
 *
 * Dosya API'den geçmiyor; tarayıcı imzalı adrese doğrudan yazıyor. Beyan
 * edilen boyut ve tür burada **ön** kontrolden geçiyor (kullanıcıya erken
 * hata için); gerçek kontrol yükleme bittikten sonra nesnenin kendisine
 * bakılarak yapılıyor — imza gövdeyi kapsamadığı için beyan bağlayıcı değil.
 */
export const documentUploadUrlRequest = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

export const documentUploadUrlResult = z.object({
  /** Depodaki nesne anahtarı; 2. adımda kayıt bununla açılıyor. */
  key: z.string(),
  uploadUrl: z.string(),
  expiresInSeconds: z.number().int(),
});

/** 2. adım: yükleme bittikten sonra kaydı aç. */
export const documentCreate = z.object({
  key: z.string().trim().min(1).max(300),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  category: documentCategory.default("other"),
  visibility: documentVisibility.default("managers"),
  expiresAt: z.coerce.date().nullish(),
});

/** İndirme adresi — kısa ömürlü ve imzalı. */
export const documentDownloadResult = z.object({
  url: z.string(),
  expiresInSeconds: z.number().int(),
});

export type DocumentListResponse = z.infer<typeof documentListResponse>;
export type DocumentUploadUrlRequest = z.infer<typeof documentUploadUrlRequest>;
export type DocumentUploadUrlResult = z.infer<typeof documentUploadUrlResult>;
export type DocumentCreate = z.infer<typeof documentCreate>;
export type DocumentDownloadResult = z.infer<typeof documentDownloadResult>;

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

/* --------------------------------------------------- hukuk: yazma */

/**
 * İcra aşamaları — `legal_stage` enum'ının aynısı.
 *
 * Sıra kanuni akışı izliyor: ihtarname → tebligat → dava → ilam → icra →
 * haciz → tahsilat. `closed` bir aşama değil bir son; ayrı uçla veriliyor
 * (`close`), çünkü kapatmak gerekçe istiyor.
 */
export const legalStage = z.enum([
  "warning_letter",
  "notice_served",
  "lawsuit",
  "judgment",
  "enforcement",
  "seizure",
  "collection",
  "closed",
]);

/**
 * Dosya açma.
 *
 * TUTAR GÖNDERİLMİYOR. Ana para, dairenin **açık borçlarından** sunucuda
 * toplanıyor: istemciden alınsaydı ekranda gösterilen ile dosyaya yazılan
 * ayrışabilirdi ve icra dosyasının tutarı, hakkında dava açılan rakam.
 */
export const legalCaseCreate = z.object({
  unitId: uuid,
  caseNo: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

/**
 * Dosya güncelleme — aşama, sıradaki işlem ve dosya numarası.
 *
 * Aşama değişikliği kütüğe (`legal_case_events`) **otomatik** yazılıyor:
 * "bu dosya ne zaman icraya döndü" sorusunun cevabı, kimsenin ayrıca not
 * girmesine bağlı olmamalı.
 */
export const legalCaseUpdate = z.object({
  stage: legalStage.optional(),
  caseNo: z.string().trim().max(60).nullish(),
  nextActionAt: z.coerce.date().nullish(),
  nextActionNote: z.string().trim().max(500).nullish(),
  /** Aşama değişiminde kütüğe düşecek not. */
  note: z.string().trim().max(1000).nullish(),
});

/** Elle olay/not ekleme — duruşma, tebligat, avukat görüşmesi. */
export const legalEventCreate = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).nullish(),
  occurredAt: z.coerce.date().optional(),
  // M-52: documentUrl yalnız güvenli https URL kabul eder; javascript:,
  // data:, ve diğer scheme'ler reddedilir. XSS/phishing pivot engellenir.
  documentUrl: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .refine(
      (v) => {
        if (!v) return true;
        try {
          const u = new URL(v);
          return u.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "documentUrl yalnızca https URL olabilir." },
    ),
});

/**
 * Para hareketi: masraf ya da tahsilat.
 *
 * İkisi tek uçta ve **artımlı**: mutlak tutar yazdırmak, iki yöneticinin aynı
 * anda kaydettiği iki tahsilattan birinin diğerini ezmesi demekti. Artımlı
 * yazma o yarışta ikisini de topluyor.
 */
export const legalAmountEntry = z.object({
  kind: z.enum(["cost", "collection"]),
  amountMinor: moneyMinor.refine((v) => v > 0, "Tutar sıfırdan büyük olmalı."),
  note: z.string().trim().max(500).nullish(),
});

/** Dosya kapatma — gerekçe zorunlu. */
export const legalCaseClose = z.object({
  reason: z.string().trim().min(10).max(500),
});

export type LegalStage = z.infer<typeof legalStage>;
export type LegalCaseCreate = z.infer<typeof legalCaseCreate>;
export type LegalCaseUpdate = z.infer<typeof legalCaseUpdate>;
export type LegalEventCreate = z.infer<typeof legalEventCreate>;
export type LegalAmountEntry = z.infer<typeof legalAmountEntry>;
export type LegalCaseClose = z.infer<typeof legalCaseClose>;

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
