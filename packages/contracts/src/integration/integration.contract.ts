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

export const bankOverviewResponse = z.object({
  accounts: z.array(bankAccountRow),
  transactions: z.array(bankTransactionRow),
  issues: z.array(reconciliationIssueRow),
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
