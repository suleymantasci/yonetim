import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";

import { QUEUE_DEMO } from "@yonetim/jobs";

import { PropertyModule } from "../property/property.module";
import { DemoController, DemoPlatformController } from "./demo/demo.controller";
import { DemoLifecycleService } from "./demo/demo-lifecycle.service";
import { DemoService } from "./demo/demo.service";
import { ImpersonationService } from "./impersonation.service";
import { LifecycleController } from "./lifecycle.controller";
import { LifecycleService } from "./lifecycle.service";
import { PlatformAccountsService } from "./platform-accounts.service";
import { PlatformBillingService } from "./platform-billing.service";
import { PlatformController } from "./platform.controller";
import { PortfolioController } from "./portfolio.controller";
import { SettingsWriteService } from "./settings-write.service";
import { StaffLedgerService } from "./staff-ledger.service";
import { StaffWriteService } from "./staff-write.service";
import { TenancyController } from "./tenancy.controller";
import { TenancyService } from "./tenancy.service";

/**
 * `tenancy` bağlamı — site, abonelik, personel (MIMARI-PLAN §6.3).
 *
 * `PropertyModule` içeri alınıyor çünkü personelin TCKN/IBAN şifrelemesi
 * `PiiService` üzerinden yapılıyor — sakinlerde kullanılan **aynı** servis.
 * İkinci bir şifreleme yolu açmak, anahtar döndürme gününde iki ayrı yerin
 * güncellenmesini gerektirirdi. Ters yönde bağımlılık yok, döngü oluşmuyor.
 */
@Module({
  imports: [PropertyModule, BullModule.registerQueue({ name: QUEUE_DEMO })],
  controllers: [
    TenancyController,
    LifecycleController,
    PlatformController,
    PortfolioController,
    DemoController,
    DemoPlatformController,
  ],
  providers: [
    TenancyService,
    StaffWriteService,
    StaffLedgerService,
    SettingsWriteService,
    LifecycleService,
    PlatformAccountsService,
    PlatformBillingService,
    ImpersonationService,
    DemoService,
    DemoLifecycleService,
  ],
  exports: [TenancyService, LifecycleService],
})
export class TenancyModule {}
