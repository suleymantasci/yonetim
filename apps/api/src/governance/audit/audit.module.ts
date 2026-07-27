import { Global, Module } from "@nestjs/common";

import { AuditController } from "./audit.controller";
import { AuditReadService } from "./audit-read.service";
import { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";

/**
 * Denetim global: her modül **yazabilmeli**, ama tek bir uygulama üzerinden.
 * Kütüğün "kim, ne, neden" alanları böylece her yerde aynı şekilde doluyor.
 *
 * Okuma tarafı (`AuditReadService`) dışa açılmıyor: kütüğü sorgulamak
 * yalnız denetim ekranının işi, iş akışlarının değil.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReadService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
