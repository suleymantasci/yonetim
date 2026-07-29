import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  announcementCreate,
  meetingDecisionSave,
  meetingSave,
  messageSend,
  pollClose,
  pollSave,
  type AnnouncementCreate,
  type MeetingDecisionSave,
  type MeetingSave,
  type MessageSend,
  type PollClose,
  type PollSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { CommunicationWriteService } from "./communication-write.service";
import { CommunicationService } from "./communication.service";

/** Panel iç BFF yüzeyi — `/v1/panel/communication/*`. */
@ApiTags("panel/communication")
@Controller("v1/panel/communication")
export class CommunicationController {
  constructor(
    private readonly service: CommunicationService,
    private readonly write: CommunicationWriteService,
  ) {}

  @Get("announcements")
  @RequirePermission("announcement:read")
  announcements() {
    return this.service.announcements();
  }

  @Post("announcements")
  @RequirePermission("announcement:write")
  @ApiOperation({
    summary: "Duyuru oluştur — KVKK filtresi kapı olarak",
    description:
      "Filtre engellerse duyuru **kaydedilmez** ve `id: null` döner. Karar " +
      "sunucuda verilir; istemcinin bayrağına güvenmek kapıyı işlevsiz kılardı.",
  })
  createAnnouncement(
    @Body(new ZodBodyPipe(announcementCreate)) dto: AnnouncementCreate,
  ) {
    return this.service.createAnnouncement(dto);
  }

  @Get("polls")
  @RequirePermission("poll:read")
  polls() {
    return this.service.polls();
  }

  @Post("polls")
  @RequirePermission("poll:write")
  @ApiOperation({
    summary: "Anket/oylama aç",
    description:
      "Seçenek kimlikleri **sunucuda** üretilir ve düzenlemede korunur: " +
      "oylar `option_id` ile saklandığı için kimlikleri baştan üretmek " +
      "verilmiş oyları başka seçeneğe bağlardı. KMK md.31 gereği " +
      "`ownersOnly` varsayılan olarak açıktır.",
  })
  createPoll(@Body(new ZodBodyPipe(pollSave)) dto: PollSave) {
    return this.write.savePoll(dto);
  }

  @Patch("polls/:id")
  @RequirePermission("poll:write")
  @ApiOperation({
    summary: "Anketi güncelle",
    description: "Kapanmış oylama düzenlenemez (400).",
  })
  updatePoll(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(pollSave)) dto: PollSave,
  ) {
    return this.write.savePoll(dto, id);
  }

  @Post("polls/:id/close")
  @RequirePermission("poll:write")
  @ApiOperation({
    summary: "Oylamayı kapat ve sonucu sakla",
    description:
      "Sonuç `result_json`'a **yazılır**, her okumada yeniden " +
      "hesaplanmaz: ağırlık modu ya da arsa payları sonradan değişirse " +
      "kapanmış bir kararın sonucu değişmemeli. Yeter sayı tabanı kurala " +
      "bağlı — nitelikli çoğunluklar tüm kat malikleri üzerinden ölçülür.",
  })
  closePoll(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(pollClose)) dto: PollClose,
  ) {
    return this.write.closePoll(id, dto);
  }

  @Get("messages")
  @RequirePermission("message:read")
  @ApiOperation({
    summary: "Gelen kutusu — yazışmalar kişiye göre kümelenmiş",
    description:
      "Mesaj kütüğü değil konuşma listesi döner: her satır bir muhatap, " +
      "son mesajı ve cevap bekleyip beklemediği. Sakin kaydıyla eşleşmemiş " +
      "mesajlar tek bir `correspondent.id: null` başlığında toplanır.",
  })
  messages() {
    return this.service.messages();
  }

  @Get("messages/:userId")
  @RequirePermission("message:read")
  @ApiOperation({ summary: "Tek sakinle yazışmanın tamamı" })
  messageThread(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.service.messageThread(userId);
  }

  @Post("messages")
  @RequirePermission("message:write")
  @ApiOperation({
    summary: "Tek kişiye mesaj gönder",
    description:
      "WhatsApp serbest metni yalnız 24 saatlik servis penceresi açıkken " +
      "gider; kapalıysa mesaj gönderilmez ve `blockedReason: window_closed` " +
      "döner. Engellenen gönderim de kayda geçer — yönetici neden " +
      "ulaşamadığını görebilmeli.",
  })
  sendMessage(@Body(new ZodBodyPipe(messageSend)) dto: MessageSend) {
    return this.write.sendMessage(dto);
  }

  @Get("meetings")
  @RequirePermission("meeting:read")
  meetings() {
    return this.service.meetings();
  }

  @Post("meetings")
  @RequirePermission("meeting:write")
  @ApiOperation({
    summary: "Toplantı oluştur",
    description:
      "İkinci çağrı tarihi (KMK md.30) otomatik doldurulmaz: kanuni asgari " +
      "bir varsayılan sanılmamalı, tarihi çağrı metnine yazmak yönetimin işi.",
  })
  createMeeting(@Body(new ZodBodyPipe(meetingSave)) dto: MeetingSave) {
    return this.write.saveMeeting(dto);
  }

  @Patch("meetings/:id")
  @RequirePermission("meeting:write")
  @ApiOperation({ summary: "Toplantıyı güncelle" })
  updateMeeting(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(meetingSave)) dto: MeetingSave,
  ) {
    return this.write.saveMeeting(dto, id);
  }

  /**
   * Toplantı kararı — **karar defteri değil**.
   *
   * Site geneli sürekli numaralı, değiştirilemez defter ayrı
   * (`/v1/panel/decision-book`, §2.7). Buradaki numara toplantı içinde
   * tekildir ve tutanağın kendi sırasını taşır.
   */
  @Post("meetings/:id/decisions")
  @RequirePermission("meeting:write")
  @ApiOperation({
    summary: "Toplantı tutanağına karar ekle",
    description:
      "Karar numarası sunucuda üretilir; toplantı içinde tekil olmalı " +
      "(`idx_decisions_meeting_no`) ve istemciye bırakmak iki kişinin aynı " +
      "numarayı yazmasına izin verirdi.",
  })
  addMeetingDecision(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(meetingDecisionSave)) dto: MeetingDecisionSave,
  ) {
    return this.write.addMeetingDecision(id, dto);
  }
}
