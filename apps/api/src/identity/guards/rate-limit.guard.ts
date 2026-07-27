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
 * Hız sınırı — `apps/app/src/lib/api.ts` içindeki davranış korunuyor.
 * Redis yoksa sınır uygulanmaz; geliştirme kurulumu Redis'siz de çalışsın.
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
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [exec.getHandler(), exec.getClass()])
    ) {
      return true;
    }

    const ctx = this.cls.get("ctx");
    if (!ctx) return true;
    // Worker iç trafiği sınırlanmaz: kendi kuyruğu zaten hızı belirliyor.
    if (ctx.source === "internal") return true;

    const identifier = ctx.apiKeyId ?? `${ctx.userId}:${ctx.tenantId}`;
    const limit = ctx.apiKeyId ? API_KEY_DEFAULT_LIMIT : SESSION_LIMIT_PER_MINUTE;

    const count = await this.redis.incrWindow(`rl:${identifier}`, 60);
    if (count === null) return true;

    if (count > limit) {
      const res = exec.switchToHttp().getResponse<Response>();
      res.setHeader("Retry-After", "60");
      throw new HttpException("rate_limited", HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
