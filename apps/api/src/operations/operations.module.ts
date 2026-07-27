import { Module } from "@nestjs/common";

import { JobRunController } from "./job-run/job-run.controller";
import { JobRunService } from "./job-run/job-run.service";
import { OperationsController } from "./operations.controller";
import { OperationsRepository } from "./operations.repository";
import { OperationsService } from "./operations.service";

/**
 * `operations` bağlamı — talep, bakım, rezervasyon, sayaç (MIMARI-PLAN §6.3).
 * Uzun süren iş koşuları da burada (§10 B3): ilerleme ve iptal, talep/bakım
 * gibi operasyonel bir kavram.
 */
@Module({
  controllers: [OperationsController, JobRunController],
  providers: [OperationsService, OperationsRepository, JobRunService],
  // `JobRunService` dışa açık: uzun süren işi başlatan her modül (göç,
  // toplu borç, rapor) koşu kaydını buradan açıyor ve worker aynı servisle
  // ilerlemeyi yazıyor.
  exports: [OperationsService, JobRunService],
})
export class OperationsModule {}
