import { Module } from "@nestjs/common";

import { DebtWriteRepository } from "./debt/debt-write.repository";
import { DuesPlanController } from "./dues-plan/dues-plan.controller";
import { DuesPlanService } from "./dues-plan/dues-plan.service";
import { ExpenseWriteRepository } from "./expense/expense-write.repository";
import { ExpenseController } from "./expense/expense.controller";
import { ExpenseRepository } from "./expense/expense.repository";
import { ExpenseService } from "./expense/expense.service";
import { CertificateController } from "./certificate/certificate.controller";
import { CertificateService } from "./certificate/certificate.service";
import { DebtController } from "./debt/debt.controller";
import { DebtRepository } from "./debt/debt.repository";
import { DebtService } from "./debt/debt.service";
import { PortalPaymentController } from "./portal-payment/portal-payment.controller";
import { PropertyModule } from "../property/property.module";

/**
 * `finance` bağlamı — MIMARI-PLAN §6.4: aidat planı, borç, tahsilat, gider,
 * dağıtım, gecikme, banka mutabakat, borcu-yoktur.
 *
 * A2'de `debt` + `payment` + `expense` + `dues-plan`, A5'te borcu-yoktur
 * belgesi. Tahsilat borç modülünün içinde yaşıyor: mahsup borçlara yazdığı
 * için ikisini ayırmak transaction sınırını bölerdi. Banka mutabakatı
 * `integration` bağlamında — orası dış sistemle konuşan taraf.
 */
@Module({
  // Havale hedefinin IBAN'ı şifreli saklanıyor ve çözümü `PiiService`'te.
  // İkinci bir çözme yolu açmak, anahtarın iki yerde kullanılması demekti.
  imports: [PropertyModule],
  controllers: [
    DebtController,
    ExpenseController,
    DuesPlanController,
    CertificateController,
    PortalPaymentController,
  ],
  providers: [
    DebtService,
    DebtRepository,
    DebtWriteRepository,
    ExpenseService,
    ExpenseRepository,
    ExpenseWriteRepository,
    DuesPlanService,
    CertificateService,
  ],
  exports: [DebtService, DebtRepository, ExpenseService, DuesPlanService],
})
export class FinanceModule {}
