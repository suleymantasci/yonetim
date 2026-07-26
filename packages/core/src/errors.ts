export type AppErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "tenant_mismatch"
  | "integration_unavailable"
  | "payment_failed"
  | "kvkk_violation"
  | "internal";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.status = STATUS_BY_CODE[code];
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  tenant_mismatch: 403,
  integration_unavailable: 503,
  payment_failed: 402,
  kvkk_violation: 451,
  internal: 500,
};

export const errors = {
  unauthorized: (m = "Oturum açmanız gerekiyor.") => new AppError("unauthorized", m),
  forbidden: (m = "Bu işlem için yetkiniz yok.") => new AppError("forbidden", m),
  notFound: (m = "Kayıt bulunamadı.") => new AppError("not_found", m),
  validation: (m: string, details?: unknown) => new AppError("validation", m, details),
  conflict: (m: string) => new AppError("conflict", m),
  rateLimited: (m = "Çok fazla istek gönderdiniz, lütfen bekleyin.") =>
    new AppError("rate_limited", m),
  tenantMismatch: () =>
    new AppError("tenant_mismatch", "Kayıt başka bir siteye ait."),
  integrationUnavailable: (provider: string) =>
    new AppError("integration_unavailable", `${provider} entegrasyonu şu an kullanılamıyor.`),
  paymentFailed: (m: string) => new AppError("payment_failed", m),
  kvkkViolation: (m: string) => new AppError("kvkk_violation", m),
  internal: (m = "Beklenmeyen bir hata oluştu.") => new AppError("internal", m),
};

/** Hata fırlatmayan sonuç tipi — entegrasyon adaptörlerinde kullanılır. */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
