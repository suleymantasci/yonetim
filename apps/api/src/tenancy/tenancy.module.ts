import { Module } from "@nestjs/common";

import { PlatformController } from "./platform.controller";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";

/** `tenancy` bağlamı — site, abonelik, personel (MIMARI-PLAN §6.3). */
@Module({
  controllers: [TenancyController, PlatformController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
