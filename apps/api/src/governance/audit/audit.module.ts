import { Global, Module } from "@nestjs/common";

import { AuditController } from "./audit.controller";
import { AuditReadService } from "./audit-read.service";
import { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";
import { DecisionBookController } from "../decision-book/decision-book.controller";
import { DecisionBookService } from "../decision-book/decision-book.service";
import { DocumentWriteService } from "../document/document-write.service";
import { DocumentController } from "../document/document.controller";
import { LawyerService } from "../document/lawyer.service";
import { DocumentService } from "../document/document.service";
import { LegalWriteService } from "../document/legal-write.service";
import { KvkkController } from "../kvkk/kvkk.controller";
import { KvkkWriteService } from "../kvkk/kvkk-write.service";

/**
 * Denetim global: her modül **yazabilmeli**, ama tek bir uygulama üzerinden.
 * Kütüğün "kim, ne, neden" alanları böylece her yerde aynı şekilde doluyor.
 *
 * Okuma tarafı (`AuditReadService`) dışa açılmıyor: kütüğü sorgulamak
 * yalnız denetim ekranının işi, iş akışlarının değil.
 */
@Global()
@Module({
  controllers: [AuditController, DocumentController, DecisionBookController, KvkkController],
  providers: [
    AuditService,
    AuditReadService,
    AuditRepository,
    DocumentService,
    DocumentWriteService,
    LegalWriteService,
    LawyerService,
    KvkkWriteService,
    // Karar defteri `governance` bağlamında: denetim kütüğü ve belge deposuyla
    // aynı yükümlülük ailesinden (kayıt tutma, hesap verme).
    DecisionBookService,
  ],
  exports: [AuditService],
})
export class AuditModule {}
