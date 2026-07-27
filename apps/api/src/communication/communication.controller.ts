import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../identity/decorators";
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
