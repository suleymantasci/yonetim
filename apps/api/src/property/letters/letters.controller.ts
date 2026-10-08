import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { recipientQuery } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { grants } from "../../identity/permission";
import { DbService } from "../../infra/db/db.service";
import { LettersService } from "./letters.service";

/** Yazışma alıcıları — `/v1/panel/letters/*`. */
@ApiTags("panel/letters")
@Controller("v1/panel/letters")
export class LettersController {
  constructor(
    private readonly service: LettersService,
    private readonly db: DbService,
  ) {}

  @Get("recipients")
  @RequirePermission("resident:read")
  @ApiOperation({
    summary: "Daire başına yazışma alıcıları (etiket, çağrı, vekaletname)",
    description: "`phones=1` için ayrıca `report:export` gerekir; erişim denetim kaydına yazılır.",
  })
  recipients(@Query() query: Record<string, string>) {
    const q = recipientQuery.parse(query);
    const phones = q.phones === "1";
    if (phones && !grants(this.db.ctx(), "report:export")) {
      throw new ForbiddenException("forbidden:report_export");
    }
    return this.service.recipients({ member: q.member, blockId: q.blockId, phones });
  }
}
