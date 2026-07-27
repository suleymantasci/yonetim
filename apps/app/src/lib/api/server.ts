import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { z } from "zod";

import { AppError, type AppErrorCode } from "@yonetim/core";

/**
 * RSC ve Server Action tarafındaki tipli API istemcisi — MIMARI-PLAN §9.2c.
 *
 * Üç iş yapar:
 *  1. **Cookie'yi olduğu gibi iletir.** Next oturum çözmez; tek otorite `apps/api`
 *     (§8.1). Bu, Next'e "ben bu tenant'ın adminiyim" iddiasını imzalama yetkisi
 *     vermemek demek — iptal anında etkili kalıyor.
 *  2. **`x-request-id`'yi taşır.** app → api → worker aynı kimlikle izlenir (§14 D).
 *  3. **Yanıtı `packages/contracts` şemasıyla doğrular.** Sunucu sözleşmeden
 *     saparsa hata render sırasında çıkar, `undefined is not a function` olarak
 *     üç ekran sonra değil.
 *
 * `cache()` sarmalayıcısı **render içi dedupe** sağlar: aynı render pass'inde
 * aynı GET bir kez gider (§9.2c). Sayfa + layout aynı veriyi isterse iki hop
 * olmuyor.
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";

export interface ApiRequestOptions {
  /** `X-Change-Reason` — gerekçeli düzeltme (GAP-DURUM kararı 9). */
  reason?: string;
  /** Çoklu üyelikte site değiştirme. */
  tenantSlug?: string;
  signal?: AbortSignal;
}

async function buildHeaders(options: ApiRequestOptions = {}): Promise<Record<string, string>> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);

  const result: Record<string, string> = {
    cookie: cookieStore.toString(),
    accept: "application/json",
    "x-request-id": headerList.get("x-request-id") ?? crypto.randomUUID(),
  };

  const clientIp = headerList.get("x-client-ip") ?? headerList.get("x-forwarded-for");
  if (clientIp) result["x-client-ip"] = clientIp.split(",")[0]!.trim();

  const userAgent = headerList.get("user-agent");
  if (userAgent) result["user-agent"] = userAgent;

  const slug = options.tenantSlug ?? headerList.get("x-tenant-slug");
  if (slug) result["x-tenant-slug"] = slug;

  // Başlıklar latin-1 taşır; Türkçe gerekçe metni encode edilerek gönderilir,
  // API tarafında tek yerde çözülüyor.
  if (options.reason) result["x-change-reason"] = encodeURIComponent(options.reason);

  return result;
}

/**
 * API hatasını `packages/core` `AppError`'a çevirir.
 *
 * Neden çevriliyor: `apps/app` bugün her yerde `AppError` yakalıyor (error.tsx,
 * `runAction`, not-found). Yeni bir hata tipi eklemek 40 dosyada `catch`
 * güncellemek olurdu; zarf tek noktada eski tipe indirgeniyor.
 */
async function toAppError(res: Response): Promise<AppError> {
  let code: AppErrorCode = "internal";
  let message = "Beklenmeyen bir hata oluştu.";
  let details: unknown;

  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (body.error?.message) message = body.error.message;
    details = body.error?.details;
    code = mapCode(body.error?.code, res.status);
  } catch {
    code = mapCode(undefined, res.status);
  }

  return new AppError(code, message, details);
}

/** Sözleşme kodu → `packages/core` kodu. `validation_failed` → `validation`. */
function mapCode(code: string | undefined, status: number): AppErrorCode {
  switch (code) {
    case "unauthorized":
    case "forbidden":
    case "not_found":
    case "conflict":
    case "rate_limited":
    case "tenant_mismatch":
    case "payment_failed":
    case "kvkk_violation":
    case "internal":
      return code;
    case "validation_failed":
    case "consent_required":
      return "validation";
    // Önizleme ve gerekçe zorunluluğu (§7) çakışma/doğrulama olarak yüzeye çıkar;
    // ekranların bu iki durumu ayırt etmesi gerekmiyor, mesaj yeterli.
    case "preview_required":
      return "conflict";
    case "reason_required":
      return "validation";
    default:
      break;
  }
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "validation";
  return "internal";
}

async function request<T extends z.ZodTypeAny>(
  method: string,
  path: string,
  schema: T | null,
  body: unknown,
  options: ApiRequestOptions = {},
): Promise<z.infer<T>> {
  const headersInit = await buildHeaders(options);
  if (body !== undefined) headersInit["content-type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headersInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
    // Panel verisi her zaman taze: RLS bağlamına bağlı yanıtlar önbelleğe alınmaz.
    cache: "no-store",
  });

  if (!res.ok) throw await toAppError(res);
  if (res.status === 204) return undefined as z.infer<T>;

  const json: unknown = await res.json();
  return schema ? (schema.parse(json) as z.infer<T>) : (json as z.infer<T>);
}

/**
 * GET — render içi dedupe'lu.
 *
 * `cache()` argümanlara göre anahtarlıyor; şema nesnesi modül seviyesinde sabit
 * olduğu için aynı `(path, schema)` çifti aynı anahtara düşüyor.
 */
export const apiGet = cache(
  async <T extends z.ZodTypeAny>(
    path: string,
    schema: T,
    options?: ApiRequestOptions,
  ): Promise<z.infer<T>> => request("GET", path, schema, undefined, options),
);

export function apiPost<T extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  schema: T,
  options?: ApiRequestOptions,
): Promise<z.infer<T>>;
export function apiPost(path: string, body: unknown, schema?: null, options?: ApiRequestOptions): Promise<unknown>;
export function apiPost(
  path: string,
  body: unknown,
  schema: z.ZodTypeAny | null = null,
  options?: ApiRequestOptions,
): Promise<unknown> {
  return request("POST", path, schema, body, options);
}

export function apiPatch<T extends z.ZodTypeAny>(
  path: string,
  body: unknown,
  schema: T,
  options?: ApiRequestOptions,
): Promise<z.infer<T>>;
export function apiPatch(path: string, body: unknown, schema?: null, options?: ApiRequestOptions): Promise<unknown>;
export function apiPatch(
  path: string,
  body: unknown,
  schema: z.ZodTypeAny | null = null,
  options?: ApiRequestOptions,
): Promise<unknown> {
  return request("PATCH", path, schema, body, options);
}

export function apiDelete(path: string, options?: ApiRequestOptions): Promise<unknown> {
  return request("DELETE", path, null, undefined, options);
}

/** Nesneyi querystring'e çevirir; boş/undefined alanlar yazılmaz. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}
