import { Module } from "@nestjs/common";

import { IntegrationController } from "./integration.controller";
import { IntegrationService } from "./integration.service";

/** `integration` bağlamı — banka, ödeme sağlayıcı, veri göçü (MIMARI-PLAN §6.3). */
@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationModule {}
