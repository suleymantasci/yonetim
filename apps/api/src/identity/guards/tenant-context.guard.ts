import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";

import type { ClsStore } from "../../infra/cls/request-context";
import { ContextResolver } from "../context-resolver.service";
import { PUBLIC_KEY } from "../decorators";

/**
 * Dört kimlik yolu, tek çıktı — MIMARI-PLAN §8.1.
 *
 * Sıra önemli: cookie en sık yol, en ucuz kontrol (önbellekli). API anahtarı
 * ile mobil JWT'nin ikisi de `Authorization: Bearer` taşıdığı için birbirinden
 * `yk_live_` öneki ile ayrılıyor.
 *
 * Buradan sonra istek tipinin ne olduğu **hiçbir yerde** sorulmuyor: yetki,
 * RLS ve denetim tek kod yolunda kalıyor.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly resolver: ContextResolver,
    private readonly cls: ClsService<ClsStore>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(exec: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      exec.getHandler(),
      exec.getClass(),
    ]);
    if (isPublic) return true;

    const req = exec.switchToHttp().getRequest<Request>();

    const ctx =
      (await this.resolver.fromSessionCookie(req)) ?? // panel + sakin portalı
      (await this.resolver.fromMobileJwt(req)) ?? // Faz 17 mobil
      (await this.resolver.fromApiKey(req)) ?? // muhasebe yazılımı
      (await this.resolver.fromInternalToken(req)); // worker → api

    if (!ctx) throw new UnauthorizedException("unauthorized");

    this.cls.set("ctx", ctx);

    // Log satırlarının bağlamı taşıması için (pino `customProps`).
    Object.assign(req, { tenantId: ctx.tenantId, userId: ctx.userId });
    return true;
  }
}
