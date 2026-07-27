import { Module } from "@nestjs/common";

import { OperationsController } from "./operations.controller";
import { OperationsRepository } from "./operations.repository";
import { OperationsService } from "./operations.service";

/** `operations` bağlamı — talep, bakım, rezervasyon, sayaç (MIMARI-PLAN §6.3). */
@Module({
  controllers: [OperationsController],
  providers: [OperationsService, OperationsRepository],
  exports: [OperationsService],
})
export class OperationsModule {}
