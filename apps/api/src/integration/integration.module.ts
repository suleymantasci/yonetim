import { Module } from "@nestjs/common";

import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";
import { IyzicoWebhookController } from "./payment/iyzico-webhook.controller";

/** `integration` bağlamı — banka, ödeme sağlayıcı, veri göçü (MIMARI-PLAN §6.3). */
@Module({
  controllers: [IntegrationController, IyzicoWebhookController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
