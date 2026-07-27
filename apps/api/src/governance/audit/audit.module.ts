import { Global, Module } from "@nestjs/common";

import { AuditService } from "./audit.service";

/**
 * Denetim global: her modül yazabilmeli, ama tek bir uygulama üzerinden.
 * Kütüğün "kim, ne, neden" alanları böylece her yerde aynı şekilde doluyor.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
