import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Response } from "express";
import { ClsService } from "nestjs-cls";

import type { ClsStore } from "../../infra/cls/request-context";
import { RedisService } from "../../infra/redis/redis.service";
import { PUBLIC_KEY } from "../decorators";

/** Oturum yolunda genel API limiti; anahtar yolunda anahtar başına limit. */
const SESSION_LIMIT_PER_MINUTE = 300;
const API_KEY_DEFAULT_LIMIT = 120;
/**
 * `@Public()` rotalar için varsayılan IP başına dakika limiti. Login/OTP/
 * SMS gibi yüksek-hassasiyet uçlar `packages/auth/rate-limit` üzerinden
 * ek olarak daraltılır; buradaki 60/dk/IP üst sınır olarak DoS penceresini
 * kapatır.
 */
const PUBLIC_DEFAULT_LIMIT = 60;

/**
 * Hız sınırı — `apps/app/src/lib/api.ts` içindeki davranış korunuyor.
 *
 * C-3: Redis erişilemezse **fail-closed** davranıyoruz. Üretimde 300/dk
 * session limiti tek bir Redis kesintisinde sıfırlanmasın; koruma altındaki
 * endpoint'lere sınırsız istek gelmesin. Geliştirmede Redis olmadan
 * çalışmaya izin vermek için `RATE_LIMIT_FAIL_OPEN=true` env değişkeni
 * ile fail-open moduna geçilebilir (sadece dev/test).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly cls: ClsService<ClsStore>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(exec: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        exec.getHandler(),
        exec.getClass(),
      ])
    ) {
      // C-2: `@Public()` rotaları global session limitinden muaf. Ancak tamamen
      // sınırsız bırakmak da DoS penceresi açar — default olarak 60/dk/IP
      // limiti uyguluyoruz. Daha kısıtlı limit gereken rotalar (login, OTP
      // vb.) `packages/auth/rate-limit` içindeki `rateLimit()` ile ayrıca
      // daraltılıyor.
      const ctx = this.cls.get("ctx");
      const ip =
        ctx?.ip ??
        (exec.switchToHttp().getRequest() as { ip?: string }).ip ??
        "unknown";
      const count = await this.redis.incrWindow(`rl:public:${ip}`, 60);
      if (count === null) {
        if (process.env.RATE_LIMIT_FAIL_OPEN === "true") return true;
        const res = exec.switchToHttp().getResponse<Response>();
        res.setHeader("Retry-After", "60");
        throw new HttpException(
          "rate_limiter_unavailable",
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (count > PUBLIC_DEFAULT_LIMIT) {
        const res = exec.switchToHttp().getResponse<Response>();
        res.setHeader("Retry-After", "60");
        throw new HttpException("rate_limited", HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    }

    const ctx = this.cls.get("ctx");
    if (!ctx) return true;
    // Worker iç trafiği sınırlanmaz: kendi kuyruğu zaten hızı belirliyor.
    if (ctx.source === "internal") return true;

    const identifier = ctx.apiKeyId ?? `${ctx.userId}:${ctx.tenantId}`;
    const limit = ctx.apiKeyId
      ? API_KEY_DEFAULT_LIMIT
      : SESSION_LIMIT_PER_MINUTE;

    const count = await this.redis.incrWindow(`rl:${identifier}`, 60);
    if (count === null) {
      // Redis yok/hata — geliştirmede fail-open opsiyonu, üretimde 503.
      if (process.env.RATE_LIMIT_FAIL_OPEN === "true") return true;
      const res = exec.switchToHttp().getResponse<Response>();
      res.setHeader("Retry-After", "60");
      throw new HttpException(
        "rate_limiter_unavailable",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (count > limit) {
      const res = exec.switchToHttp().getResponse<Response>();
      res.setHeader("Retry-After", "60");
      throw new HttpException("rate_limited", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
