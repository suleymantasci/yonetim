import { Global, Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { ContextResolver } from "./context-resolver.service";
import { PermissionGuard } from "./guards/permission.guard";
import { RateLimitGuard } from "./guards/rate-limit.guard";
import { TenantContextGuard } from "./guards/tenant-context.guard";
import { MobileAuthService } from "./mobile-auth.service";

/**
 * Kimlik — oturum, mobil token, API anahtarı, iç token; yetki ve hız sınırı.
 * Global: guard'lar `APP_GUARD` ile bağlandığı için her modülde çözülebilmeli.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    ContextResolver,
    MobileAuthService,
    TenantContextGuard,
    PermissionGuard,
    RateLimitGuard,
  ],
  exports: [
    ContextResolver,
    MobileAuthService,
    TenantContextGuard,
    PermissionGuard,
    RateLimitGuard,
  ],
})
export class IdentityModule {}
