import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import {
  duesPlanSave,
  duesPlanTogglePatch,
  type DuesPlanSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { DuesPlanService } from "./dues-plan.service";

@ApiTags("panel/dues-plans")
@Controller("v1/panel/dues-plans")
export class DuesPlanController {
  constructor(private readonly service: DuesPlanService) {}

  @Get()
  @RequirePermission("dues:read")
  list() {
    return this.service.list();
  }

  @Get(":id")
  @RequirePermission("dues:read")
  byId(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.byId(id);
  }

  @Post()
  @RequirePermission("dues:write")
  save(@Body(new ZodBodyPipe(duesPlanSave)) dto: DuesPlanSave) {
    return this.service.save(dto);
  }

  @Patch(":id/durum")
  @RequirePermission("dues:write")
  toggle(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(duesPlanTogglePatch)) dto: { isActive: boolean },
  ) {
    return this.service.toggle(id, dto.isActive);
  }

  @Delete(":id")
  @RequirePermission("dues:write")
  archive(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.archive(id);
  }
}
