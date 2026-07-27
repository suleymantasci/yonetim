import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  announcementCreate,
  type AnnouncementCreate,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { CommunicationService } from "./communication.service";

/** Panel iç BFF yüzeyi — `/v1/panel/communication/*`. */
@ApiTags("panel/communication")
@Controller("v1/panel/communication")
export class CommunicationController {
  constructor(private readonly service: CommunicationService) {}

  @Get("duyurular")
  @RequirePermission("announcement:read")
  announcements() {
    return this.service.announcements();
  }

  @Post("duyurular")
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

  @Get("anketler")
  @RequirePermission("poll:read")
  polls() {
    return this.service.polls();
  }

  @Get("mesajlar")
  @RequirePermission("message:read")
  messages() {
    return this.service.messages();
  }

  @Get("toplantilar")
  @RequirePermission("meeting:read")
  meetings() {
    return this.service.meetings();
  }
}
