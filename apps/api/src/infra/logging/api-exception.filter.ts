import { randomUUID } from "node:crypto";

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import { ZodError } from "zod";

import {
  HTTP_STATUS_BY_ERROR_CODE,
  LEGACY_ERROR_CODE_MAP,
  type ApiErrorCode,
} from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import type { ClsStore } from "../cls/request-context";

/**
 * Tek hata zarfı — MIMARI-PLAN §7.
 *
 * `/v1` dış sözleşmesi `{error:{code,message,details}}` biçimindeydi ve
 * **korunuyor**; üzerine `requestId` ekleniyor. Alan eklemek kırıcı değil,
 * ama alan adı değiştirmek olurdu — bu yüzden `validation` → `validation_failed`
 * eşlemesi tek bir haritada duruyor (`LEGACY_ERROR_CODE_MAP`).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiException");

  constructor(private readonly cls: ClsService<ClsStore>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    const requestId =
      this.cls.get("ctx")?.requestId ??
      (typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null) ??
      randomUUID();

    const { status, code, message, details } = translate(exception);

    if (status >= 500) {
      this.logger.error({
        event: "request.failed",
        requestId,
        path: req.originalUrl,
        error: exception instanceof Error ? exception.stack : String(exception),
      });
    } else {
      this.logger.debug({ event: "request.rejected", requestId, code, path: req.originalUrl });
    }

    res.setHeader("x-request-id", requestId);
    res.status(status).json({ error: { code, message, details, requestId } });
  }
}

interface Translated {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

function translate(exception: unknown): Translated {
  if (exception instanceof AppError) {
    const code = LEGACY_ERROR_CODE_MAP[exception.code] ?? "internal";
    return {
      status: HTTP_STATUS_BY_ERROR_CODE[code],
      code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (exception instanceof ZodError) {
    return {
      status: HTTP_STATUS_BY_ERROR_CODE.validation_failed,
      code: "validation_failed",
      message: "Girdi doğrulaması başarısız.",
      details: exception.flatten(),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    // Guard'lar ve `ChangeReason` dekoratörü hata **kodunu** mesaj olarak
    // fırlatıyor (`reason_required`, `preview_required` …). Bilinen bir kodsa
    // olduğu gibi yayınlanır; değilse HTTP durumundan türetilir.
    const raw = typeof payload === "string" ? payload : messageOf(payload);
    const known = knownCode(raw);
    return {
      status,
      code: known ?? codeForStatus(status),
      message: known ? humanize(known) : raw,
      details: typeof payload === "object" ? (payload as Record<string, unknown>).details : undefined,
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "internal",
    message: "Beklenmeyen bir hata oluştu.",
  };
}

function messageOf(payload: unknown): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const m = (payload as { message: unknown }).message;
    return Array.isArray(m) ? m.join(", ") : String(m);
  }
  return "Beklenmeyen bir hata oluştu.";
}

const KNOWN: ApiErrorCode[] = [
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
  "internal",
];

function knownCode(raw: string): ApiErrorCode | null {
  const head = raw.split(":")[0] ?? raw;
  return KNOWN.includes(head as ApiErrorCode) ? (head as ApiErrorCode) : null;
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return "validation_failed";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "internal" : "validation_failed";
  }
}

const MESSAGES: Record<string, string> = {
  unauthorized: "Oturum açmanız gerekiyor.",
  forbidden: "Bu işlem için yetkiniz yok.",
  not_found: "Kayıt bulunamadı.",
  validation_failed: "Girdi doğrulaması başarısız.",
  conflict: "Kayıt çakışması.",
  rate_limited: "Çok fazla istek gönderdiniz, lütfen bekleyin.",
  consent_required: "KVKK aydınlatma onayı kanıtı zorunlu.",
  preview_required: "Bu işlem önce önizlenmelidir.",
  reason_required: "Bu değişiklik için en az 10 karakterlik gerekçe zorunlu.",
  tenant_mismatch: "Kayıt başka bir siteye ait.",
  internal: "Beklenmeyen bir hata oluştu.",
};

function humanize(code: ApiErrorCode): string {
  return MESSAGES[code] ?? code;
}
