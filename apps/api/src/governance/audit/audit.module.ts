import { Global, Module } from "@nestjs/common";

import { AuditController } from "./audit.controller";
import { AuditReadService } from "./audit-read.service";
import { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";
import { DecisionBookController } from "../decision-book/decision-book.controller";
import { DecisionBookService } from "../decision-book/decision-book.service";
import { DocumentController } from "../document/document.controller";
import { DocumentService } from "../document/document.service";

/**
 * Denetim global: her modül **yazabilmeli**, ama tek bir uygulama üzerinden.
 * Kütüğün "kim, ne, neden" alanları böylece her yerde aynı şekilde doluyor.
 *
 * Okuma tarafı (`AuditReadService`) dışa açılmıyor: kütüğü sorgulamak
 * yalnız denetim ekranının işi, iş akışlarının değil.
 */
@Global()
@Module({
  controllers: [AuditController, DocumentController, DecisionBookController],
  providers: [
    AuditService,
    AuditReadService,
    AuditRepository,
    DocumentService,
    // Karar defteri `governance` bağlamında: denetim kütüğü ve belge deposuyla
    // aynı yükümlülük ailesinden (kayıt tutma, hesap verme).
    DecisionBookService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
