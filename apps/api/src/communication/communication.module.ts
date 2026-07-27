import { Module } from "@nestjs/common";

import { CommunicationController } from "./communication.controller";
import { CommunicationRepository } from "./communication.repository";
import { CommunicationService } from "./communication.service";

/** `communication` bağlamı — duyuru, anket, mesaj, toplantı (MIMARI-PLAN §6.3). */
@Module({
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationRepository],
  exports: [CommunicationService],
})
export class CommunicationModule {}
