import { Global, Module } from "@nestjs/common";

import { AppContextService } from "./app-context.service";
import { AuthController } from "./auth.controller";
import { ContextResolver } from "./context-resolver.service";
import { PermissionGuard } from "./guards/permission.guard";
import { RateLimitGuard } from "./guards/rate-limit.guard";
import { TenantContextGuard } from "./guards/tenant-context.guard";
import { MobileAuthService } from "./mobile-auth.service";
import { WebAuthService } from "./web-auth.service";

/**
 * Kimlik — oturum, mobil token, API anahtarı, iç token; yetki ve hız sınırı.
 * Global: guard'lar `APP_GUARD` ile bağlandığı için her modülde çözülebilmeli.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    ContextResolver,
    AppContextService,
    MobileAuthService,
    WebAuthService,
    TenantContextGuard,
    PermissionGuard,
    RateLimitGuard,
  ],
  exports: [
    ContextResolver,
    AppContextService,
    MobileAuthService,
    WebAuthService,
    TenantContextGuard,
    PermissionGuard,
    RateLimitGuard,
  ],
})
export class IdentityModule {}
