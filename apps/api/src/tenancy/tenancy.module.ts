import { Module } from "@nestjs/common";

import { PropertyModule } from "../property/property.module";
import { PlatformController } from "./platform.controller";
import { PortfolioController } from "./portfolio.controller";
import { SettingsWriteService } from "./settings-write.service";
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
  imports: [PropertyModule],
  controllers: [TenancyController, PlatformController, PortfolioController],
  providers: [TenancyService, StaffWriteService, SettingsWriteService],
  exports: [TenancyService],
})
export class TenancyModule {}
