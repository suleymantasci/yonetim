import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";

import type { Permission } from "@yonetim/core";

import type { ClsStore } from "../../infra/cls/request-context";
import { PERMISSION_KEY, PUBLIC_KEY } from "../decorators";
import { grants } from "../permission";

/**
 * `@RequirePermission('unit:read')` — MIMARI-PLAN §8.5.
 *
 * İki kaynak, tek karar:
 *  - **rol yolu** (cookie, mobil, worker): `packages/core/rbac` matrisi;
 *  - **anahtar yolu** (muhasebe yazılımı): anahtarın `scopes` listesi.
 *
 * Anahtarın rolü yoktur — bilinçli. Bir entegrasyona "manager" demek, o
 * anahtara silme yetkisi de vermek olurdu; kapsam listesi daraltılabilir.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<ClsStore>,
  ) {}

  canActivate(exec: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        exec.getHandler(),
        exec.getClass(),
      ])
    ) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSION_KEY,
      [exec.getHandler(), exec.getClass()],
    );
    if (!required || required.length === 0) return true;

    const ctx = this.cls.get("ctx");
    if (!ctx) throw new ForbiddenException("forbidden");

    const granted = required.every((permission) => grants(ctx, permission));

    if (!granted) {
      // M-40: 403'ler de audit ediliyor. KVKK regulator'ı "reddedilen
      // erişim denemelerini" görmek ister; başarılı denemelerden ayırt
      // etmek için `event: "authz.denied"` ayrı bir yapı.
      const req = exec.switchToHttp().getRequest<Request>();
      this.logger.warn({
        event: "authz.denied",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        required,
        actualRoles: ctx.roles,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
      });
      throw new ForbiddenException(`forbidden:${required.join(",")}`);
    }
    return true;
  }
}
