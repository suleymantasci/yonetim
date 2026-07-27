import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";

import { hasPermission } from "@yonetim/auth";
import type { Permission } from "@yonetim/core";

import type { ClsStore } from "../../infra/cls/request-context";
import { PERMISSION_KEY, PUBLIC_KEY } from "../decorators";

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

    const granted = required.every((permission) =>
      ctx.source === "api_key"
        ? ctx.scopes.includes(permission)
        : hasPermission(ctx.roles, permission),
    );

    if (!granted)
      throw new ForbiddenException(`forbidden:${required.join(",")}`);
    return true;
  }
}
