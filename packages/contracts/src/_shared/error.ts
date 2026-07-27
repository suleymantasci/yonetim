import { z } from "zod";

/**
 * Tek hata zarfı — MIMARI-PLAN §7.
 *
 * `apps/app/src/lib/api.ts` içinde `/api/v1` için kurulmuş `{error:{code,
 * message,details}}` sözleşmesi **birebir korunuyor**; üzerine `requestId`
 * ekleniyor (trace korelasyonu, §14 Track D).
 *
 * `preview_required` ve `reason_required` kodları GAP-DURUM kararları 8 ve 9'u
 * (yıkıcı işlemde önizleme zorunlu, gerekçesiz düzeltme yok) protokol seviyesine
 * taşıyor: kural artık UI'ın iyi niyetine değil API'ye bağlı.
 */
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "rate_limited",
  "consent_required",
  "preview_required",
  "reason_required",
  "tenant_mismatch",
  "integration_unavailable",
  "payment_failed",
  "kvkk_violation",
  "internal",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorCode = z.enum(API_ERROR_CODES);

export const apiError = z.object({
  error: z.object({
    code: apiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiError>;

/** HTTP durum eşlemesi — `packages/core` `AppError` tablosuyla uyumlu. */
export const HTTP_STATUS_BY_ERROR_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_failed: 422,
  conflict: 409,
  rate_limited: 429,
  consent_required: 422,
  preview_required: 409,
  reason_required: 400,
  tenant_mismatch: 403,
  integration_unavailable: 503,
  payment_failed: 402,
  kvkk_violation: 451,
  internal: 500,
};

/**
 * `packages/core` `AppErrorCode` → sözleşme kodu.
 * Eski `validation` kodu `/v1` yüzeyinde `validation_failed` olarak yayınlanır;
 * çeviri tek yerde durur ki iki yüzey kaymasın.
 */
export const LEGACY_ERROR_CODE_MAP: Record<string, ApiErrorCode> = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "not_found",
  validation: "validation_failed",
  conflict: "conflict",
  rate_limited: "rate_limited",
  tenant_mismatch: "tenant_mismatch",
  integration_unavailable: "integration_unavailable",
  payment_failed: "payment_failed",
  kvkk_violation: "kvkk_violation",
  internal: "internal",
};
