import { isValidIban, isValidTckn, isValidVkn, normalizePhone } from "@yonetim/core";
import { z } from "zod";

/**
 * Ortak alan tipleri — sunucu DTO'su, OpenAPI şeması, istemci formu ve
 * `apps/app` tip tanımı **aynı** nesneden türer (MIMARI-PLAN §7).
 *
 * TR'ye özgü doğrulama `packages/core` içindeki algoritmalara delege edilir;
 * kural iki kez yazılmaz.
 */

/** Kuruş — para asla float taşımaz (SPEC 5.x, `packages/core/money`). */
export const moneyMinor = z.coerce.number().int();

/** Pozitif kuruş tutarı (tahsilat, gider, borç). */
export const positiveMoneyMinor = z.coerce.number().int().positive();

export const uuid = z.string().uuid();

/** `YYYY-MM` dönem anahtarı — `packages/core/date` `periodKey` ile aynı biçim. */
export const periodKey = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Dönem YYYY-AA biçiminde olmalı." });

/** ISO 8601 tarih (yalnız gün). */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Tarih-saat: hem `Date` hem ISO metni kabul eder, `Date`'e indirger. */
export const dateTime = z.coerce.date();

export const tcknInput = z
  .string()
  .trim()
  .refine(isValidTckn, { message: "TCKN kontrol basamağı doğrulanamadı." });

export const vknInput = z
  .string()
  .trim()
  .refine(isValidVkn, { message: "VKN kontrol basamağı doğrulanamadı." });

export const ibanInput = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine(isValidIban, { message: "IBAN mod-97 doğrulaması başarısız." });

/**
 * Telefon E.164'e normalize edilerek saklanır.
 *
 * GAP-DURUM kararı 7 korunuyor: numara **şifrelenmez** — hem OTP kimliği hem
 * webhook ters arama anahtarı. Maskeleme okuma ucunda yapılır (§9.1).
 */
export const phoneInput = z
  .string()
  .trim()
  .transform((v) => normalizePhone(v))
  .refine((v): v is string => v !== null, { message: "Geçerli bir telefon numarası girin." });

/** Maskeli telefon çıktısı — `/v1/residents` gibi dış okuma uçlarında. */
export const maskedPhone = z.string().nullable();

/**
 * Gerekçe alanı — GAP-DURUM kararı 9 (gerekçesiz düzeltme yok).
 * 10 karakter eşiği `DbService.txWithReason` ile aynı; iki yerde de zorlanır.
 */
export const changeReason = z
  .string()
  .trim()
  .min(10, { message: "Gerekçe en az 10 karakter olmalı." })
  .max(500);

/**
 * KVKK aydınlatma onayı kanıtı — GAP-DURUM kararı 11.
 * Dış API yazma ucunda zorunlu; eksikse `consent_required` döner.
 */
export const consentProof = z.object({
  consentVersion: z.string().min(1).max(32),
  consentAt: z.coerce.date(),
  consentText: z.string().max(4000).optional(),
});

export type ConsentProof = z.infer<typeof consentProof>;
