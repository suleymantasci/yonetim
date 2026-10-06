import { Module } from "@nestjs/common";

import { FinanceModule } from "../finance/finance.module";
import { PropertyModule } from "../property/property.module";
import { BankReconcileService } from "./bank-reconcile.service";
import { BankAccountWriteService } from "./bank-account-write.service";
import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";
import { IyzicoWebhookController } from "./payment/iyzico-webhook.controller";

/**
 * `integration` bağlamı — banka, ödeme sağlayıcı, veri göçü (MIMARI-PLAN §6.3).
 *
 * `PropertyModule` içeri alınıyor çünkü banka hesabının IBAN şifrelemesi
 * sakinlerdeki **aynı** `PiiService` üzerinden yapılıyor. İkinci bir şifreleme
 * yolu, anahtar döndürme gününde iki ayrı yerin güncellenmesi demekti.
 */
@Module({
  imports: [PropertyModule, FinanceModule],
  controllers: [IntegrationController, IyzicoWebhookController],
  providers: [IntegrationService, BankAccountWriteService, BankReconcileService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
