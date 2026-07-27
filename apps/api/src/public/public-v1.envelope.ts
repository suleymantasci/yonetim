import {
  ArgumentsHost,
  CallHandler,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { map, Observable } from "rxjs";
import { ZodError } from "zod";

import { AppError, errors } from "@yonetim/core";

/**
 * `/api/v1` — DIŞ SÖZLEŞME, DONUK (MIMARI-PLAN §9.1).
 *
 * Bu yüzeyin istemcileri bizim repomuzda değil: muhasebe yazılımları, yönetim
 * şirketlerinin kendi panelleri, entegrasyonlar. Panel uçları (`/v1/panel/*`)
 * ekran değiştikçe serbestçe değişebilir; burası **değişemez**.
 *
 * Bu yüzden zarf da taşındı: panel yüzeyi `{ ...veri }` + `{error:{...,requestId}}`
 * kullanırken bu yüzey Next'teki haliyle aynı kalıyor —
 *
 *     tekil : { "data": {...} }
 *     liste : { "data": [...], "meta": { page, pageSize, total, pageCount } }
 *     hata  : { "error": { "code": ..., "message": ..., "details": ... } }
 *
 * `requestId` bilerek **eklenmedi**: alan eklemek de sözleşmeyi değiştirmektir
 * ve katı bir istemci ayrışabilir. İzlenebilirlik `X-Request-Id` **başlığıyla**
 * sağlanıyor — gövdeye dokunmadan.
 */

/** Yanıtı zaten `{data, meta}` biçiminde döndüren uçlar işaretlenir. */
export const PUBLIC_V1_RAW = "yonetim:public-v1-raw";
export const PublicV1Raw = () => SetMetadata(PUBLIC_V1_RAW, true);

/**
 * Gövdeyi `{ data }` zarfına sarar.
 *
 * Liste uçları `meta`'yı kendileri ürettiği için `@PublicV1Raw()` ile
 * işaretlenir ve olduğu gibi geçer.
 */
@Injectable()
export class PublicV1Interceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(exec: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(PUBLIC_V1_RAW, [
      exec.getHandler(),
      exec.getClass(),
    ]);
    return next.handle().pipe(map((body) => (raw ? body : { data: body })));
  }
}

/**
 * Eski hata zarfı — `AppError.toJSON()` ile birebir.
 *
 * Nest'in kendi `HttpException`'ları da bu biçime indirgeniyor ki uç hangi
 * yoldan hata verirse versin istemci tek bir şekil görsün.
 */
@Catch()
export class PublicV1ExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("PublicV1");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      res.status(exception.status).json(exception.toJSON());
      return;
    }

    if (exception instanceof ZodError) {
      const validation = errors.validation(
        "Girdi doğrulaması başarısız.",
        exception.flatten(),
      );
      res.status(validation.status).json(validation.toJSON());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : ((payload as { message?: unknown }).message ?? exception.message);
      res.status(status).json({
        error: {
          code: codeForStatus(status),
          message: Array.isArray(message) ? message.join(", ") : String(message),
          details: undefined,
        },
      });
      return;
    }

    // Beklenmeyen hatanın mesajı dışarı sızmaz; tam hâli sunucu logunda kalır.
    this.logger.error({ event: "public_v1.unhandled", exception });
    const internal = errors.internal();
    res.status(internal.status).json(internal.toJSON());
  }
}

function codeForStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 422 || (status >= 400 && status < 500)) return "validation";
  return "internal";
}
