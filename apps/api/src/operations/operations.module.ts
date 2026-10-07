import { Module } from "@nestjs/common";

import { InventoryController } from "./inventory/inventory.controller";
import { InventoryService } from "./inventory/inventory.service";
import { JobRunController } from "./job-run/job-run.controller";
import { JobRunService } from "./job-run/job-run.service";
import { MaintenanceWriteService } from "./maintenance-write.service";
import { MeterWriteService } from "./meter-write.service";
import { OperationsController } from "./operations.controller";
import { OperationsRepository } from "./operations.repository";
import { OperationsService } from "./operations.service";
import { RequestWriteService } from "./request-write.service";
import { ReservationWriteService } from "./reservation-write.service";
import { FrontdeskController } from "./frontdesk.controller";
import { FrontdeskService } from "./frontdesk.service";

/**
 * `operations` bağlamı — talep, bakım, rezervasyon, sayaç (MIMARI-PLAN §6.3).
 * Uzun süren iş koşuları da burada (§10 B3): ilerleme ve iptal, talep/bakım
 * gibi operasyonel bir kavram.
 *
 * Demirbaş defteri (KMK md.34/9) da bu bağlamda: fiziksel varlıkların
 * takibi, bakım ve talep akışlarıyla aynı operasyonel alan.
 */
@Module({
  controllers: [OperationsController, JobRunController, InventoryController, FrontdeskController],
  providers: [
    OperationsService,
    OperationsRepository,
    RequestWriteService,
    MaintenanceWriteService,
    MeterWriteService,
    ReservationWriteService,
    JobRunService,
    InventoryService,
    FrontdeskService,
  ],
  // `JobRunService` dışa açık: uzun süren işi başlatan her modül (göç,
  // toplu borç, rapor) koşu kaydını buradan açıyor ve worker aynı servisle
  // ilerlemeyi yazıyor.
  exports: [OperationsService, JobRunService],
})
export class OperationsModule {}
