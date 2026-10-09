import { Module } from "@nestjs/common";

import { CommunicationWriteService } from "./communication-write.service";
import { CommunicationController } from "./communication.controller";
import { CommunicationRepository } from "./communication.repository";
import { CommunicationService } from "./communication.service";
import { NotificationController } from "./notification.controller";
import { WhatsappBotService } from "./whatsapp/whatsapp-bot.service";
import { WhatsappWebhookController } from "./whatsapp/whatsapp-webhook.controller";
import { MeetingGovernanceService } from "./meeting-governance.service";
import { BulkNoticeController, BulkNoticeService } from "./bulk-notice.service";

/**
 * `communication` bağlamı — duyuru, anket, mesaj, toplantı (MIMARI-PLAN §6.3).
 * Uygulama içi bildirim merkezi de burada: kabuktaki zil, bu bağlamın
 * ürettiği kayıtları gösteriyor.
 */
@Module({
  controllers: [
    CommunicationController,
    NotificationController,
    WhatsappWebhookController,
    BulkNoticeController,
  ],
  providers: [
    CommunicationService,
    CommunicationWriteService,
    CommunicationRepository,
    MeetingGovernanceService,
    WhatsappBotService,
    BulkNoticeService,
  ],
  exports: [CommunicationService],
})
export class CommunicationModule {}
