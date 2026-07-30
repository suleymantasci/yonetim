import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * `integration` bağlamı — banka mutabakatı ve veri göçü (MIMARI-PLAN §6.3).
 *
 * IBAN: hesap satırlarında şifreli IBAN var; uç yalnız **maskeli** kopyayı
 * döndürüyor (§9.1). Mutabakat eşleştirmesi zaten blind index üzerinden
 * sunucuda yapılıyor, panelin tam IBAN'a ihtiyacı yok.
 */

/* ------------------------------------------------------------------ *
 * Banka
 * ------------------------------------------------------------------ */

export const bankAccountRow = z.object({
  id: uuid,
  bankName: z.string(),
  ibanMasked: z.string().nullable(),
  accountName: z.string().nullable(),
  purpose: z.string(),
  provider: z.string().nullable(),
  balanceMinor: moneyMinor,
  lastSyncedAt: dateTime.nullable(),
  syncStatus: z.string(),
  syncError: z.string().nullable(),
  isActive: z.boolean(),
});

export const bankTransactionRow = z.object({
  id: uuid,
  accountId: uuid,
  direction: z.string(),
  amountMinor: moneyMinor,
  counterparty: z.string().nullable(),
  description: z.string().nullable(),
  transactionAt: dateTime,
  matchStatus: z.string(),
  /** Otomatik eşleştirme güveni (0–1) — düşükse insan doğrulaması gerekir. */
  matchConfidence: z.string().nullable(),
  matchedUnitNumber: z.string().nullable(),
});

export const reconciliationIssueRow = z.object({
  id: uuid,
  kind: z.string(),
  severity: z.string(),
  expectedMinor: moneyMinor,
  actualMinor: moneyMinor,
  detail: z.string().nullable(),
  resolvedAt: dateTime.nullable(),
  retryCount: z.number().int(),
  createdAt: dateTime,
});

/* ------------------------------------------------------------------ *
 * Kasa (paranın durduğu yerler)
 * ------------------------------------------------------------------ */

/**
 * Paranın durduğu tek bir yer: bir banka hesabı, nakit kasa ya da hesabı
 * belirtilmemiş tahsilat havuzu.
 *
 * NEDEN AYRI BİR HESAP: `bankAccounts.balanceKurus` **banka
 * senkronizasyonunun** gerçeği — open banking bağlanmadan sıfır kalır.
 * Panelde tahsilat ve gider girilirken o alan hiç değişmediği için ekranda
 * "tahsilat yaptım ama bakiye 0" durumu doğuyordu. Buradaki tutarlar
 * sitenin **kendi kayıtlarından** türetiliyor: giren = tamamlanmış
 * tahsilatlar (iade düşülmüş), çıkan = ödenmiş giderler.
 *
 * İki rakam çelişebilir ve çelişmesi **bilgi**: fark, kayda geçmemiş bir
 * hareket ya da eksik mutabakat demektir. Bu yüzden birleştirilmiyor.
 */
export const cashboxRow = z.object({
  /**
   * `bank` — tanımlı banka hesabı.
   * `cash` — nakit kasa (banka hesabı olmayan tahsilat/gider).
   * `unassigned` — nakit olmadığı hâlde hesabı seçilmemiş kayıtlar; kalırsa
   *   yöneticinin düzeltmesi gerekir, sessizce nakde yazmak kasayı yanıltır.
   */
  source: z.enum(["bank", "cash", "unassigned"]),
  accountId: uuid.nullable(),
  bankName: z.string().nullable(),
  accountName: z.string().nullable(),
  ibanMasked: z.string().nullable(),
  isActive: z.boolean(),
  incomingMinor: moneyMinor,
  outgoingMinor: moneyMinor,
  balanceMinor: moneyMinor,
  /** Banka senkronizasyonundan gelen bakiye (yalnız `bank` satırlarında). */
  syncedBalanceMinor: moneyMinor.nullable(),
});

export type CashboxRow = z.infer<typeof cashboxRow>;

export const bankOverviewResponse = z.object({
  accounts: z.array(bankAccountRow),
  transactions: z.array(bankTransactionRow),
  issues: z.array(reconciliationIssueRow),
  /** Kasa dökümü — her hesap ve nakit için ayrı, altında toplam. */
  cashbox: z.object({
    rows: z.array(cashboxRow),
    totals: z.object({
      incomingMinor: moneyMinor,
      outgoingMinor: moneyMinor,
      balanceMinor: moneyMinor,
      /**
       * Onaylı ama henüz ödenmemiş gider: kasadan çıkmadığı için bakiyeye
       * girmiyor, ama yöneticinin bileceği bir yük. Ayrı gösterilmezse
       * "girdiğim gider nerede" sorusu doğuyor.
       */
      unpaidExpenseMinor: moneyMinor,
    }),
  }),
  totals: z.object({
    balanceMinor: moneyMinor,
    unmatched: z.number().int(),
    openIssues: z.number().int(),
    /** Otomatik eşleşme oranı (%) — mutabakat otomasyonunun gerçek etkisi. */
    matchRatePct: z.number().int(),
  }),
});

export type BankOverviewResponse = z.infer<typeof bankOverviewResponse>;

/* ------------------------------------------------------------------ *
 * Banka hesabı — yazma
 * ------------------------------------------------------------------ */

/**
 * Hesabın ne için tutulduğu.
 *
 * Ayrımın işlevi muhasebe değil **mutabakat**: aidat hesabına düşen bir
 * havaleyle demirbaş hesabına düşeni aynı havuzda aramak, iki hesapta aynı
 * gün aynı tutar olduğunda yanlış eşleşme üretiyordu.
 */
export const BANK_ACCOUNT_PURPOSES = [
  "dues",
  "expense",
  "reserve",
  "project",
  "deposit",
  "other",
] as const;
export const bankAccountPurpose = z.enum(BANK_ACCOUNT_PURPOSES);

/**
 * `POST /v1/panel/bank/accounts` (yeni),
 * `PATCH /v1/panel/bank/accounts/:id` (güncelle).
 *
 * IBAN **açık gönderiliyor ama açık dönmüyor**: sunucu şifreleyip maskeli
 * kopyayı ve blind index'i üretiyor. Panel IBAN'ı yalnız yazarken görüyor;
 * okuma uçlarından yalnız maske geliyor (§9.1).
 *
 * `balanceMinor` **yok**: bakiye banka entegrasyonundan gelen bir gerçek,
 * elle girilecek bir alan değil. Girilebilseydi ekrandaki rakam ekstreyle
 * çelişebilir ve hangisinin doğru olduğu belirsizleşirdi.
 */
export const bankAccountSave = z.object({
  bankName: z.string().trim().min(2).max(80),
  /** TR IBAN — sunucu doğrular, şifreler ve maskeler. */
  iban: z.string().trim().min(15).max(34),
  accountName: z.string().trim().max(160).nullish(),
  purpose: bankAccountPurpose.default("dues"),
  isActive: z.coerce.boolean().default(true),
});

export type BankAccountSave = z.infer<typeof bankAccountSave>;

export const bankAccountSaveResult = z.object({
  id: uuid,
  ibanMasked: z.string(),
});

export type BankAccountSaveResult = z.infer<typeof bankAccountSaveResult>;

/** Düzenleme formunu dolduran tek satır — IBAN yine yalnız maskeli. */
export const bankAccountDetail = z.object({
  id: uuid,
  bankName: z.string(),
  ibanMasked: z.string(),
  accountName: z.string().nullable(),
  purpose: bankAccountPurpose,
  isActive: z.boolean(),
  /** Bu hesaba bağlı ödeme var mı — silme kararını etkiliyor. */
  hasPayments: z.boolean(),
});

export type BankAccountDetail = z.infer<typeof bankAccountDetail>;

/* ------------------------------------------------------------------ *
 * Veri göçü (rakip sistemden içe aktarma)
 * ------------------------------------------------------------------ */

export const migrationJobRow = z.object({
  id: uuid,
  source: z.string(),
  fileName: z.string().nullable(),
  status: z.string(),
  totalRows: z.number().int(),
  importedRows: z.number().int(),
  skippedRows: z.number().int(),
  /**
   * Hata listesi göçün **kanıtı**: atlanan satırın neden atlandığı
   * görünmezse yönetici eksik veriyi fark edemez.
   */
  errors: z.unknown().nullable(),
  summary: z.unknown().nullable(),
  startedAt: dateTime.nullable(),
  finishedAt: dateTime.nullable(),
  createdAt: dateTime,
});

export const migrationListResponse = z.object({
  rows: z.array(migrationJobRow),
});

export type MigrationListResponse = z.infer<typeof migrationListResponse>;

/* ------------------------------------------------------------------ *
 * Göç uygulama
 * ------------------------------------------------------------------ */

export const MIGRATION_SOURCES = [
  "apsiyon",
  "biyos",
  "dijiyon",
  "yonetimcell",
  "excel",
] as const;

/**
 * Göç isteği **ham dosya içeriğini** taşır, ayrıştırılmış satırları değil.
 *
 * Önizlemede ayrıştırma istemcide de yapılıyor ama yazma yolunda sunucu
 * dosyayı **yeniden** ayrıştırıyor: istemcinin gönderdiği satırlara güvenmek,
 * önizlemede görülenle yazılanın ayrışmasına açık kapı bırakırdı (aynı
 * gerekçe toplu borçlandırmadaki tek dağıtım fonksiyonu kararında da var).
 */
export const migrationCommit = z.object({
  source: z.enum(MIGRATION_SOURCES),
  fileName: z.string().trim().max(255),
  content: z.string().max(5 * 1024 * 1024),
  /**
   * Devir borcunun açıklaması. API dile bağımsız (SPEC 4.2); metni panel
   * gönderiyor çünkü sakinin göreceği açıklama onun dilinde olmalı.
   */
  carriedBalanceLabel: z.string().trim().min(1).max(200),
});

export type MigrationCommit = z.infer<typeof migrationCommit>;

export const migrationCommitResult = z.object({
  jobId: uuid,
  units: z.number().int(),
  blocks: z.number().int(),
  debts: z.number().int(),
  skipped: z.number().int(),
});

export type MigrationCommitResult = z.infer<typeof migrationCommitResult>;
