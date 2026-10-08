import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  agendaDone,
  agendaRangeQuery,
  agendaWrite,
  type AgendaWrite,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../infra/zod/zod-dto";
import { AgendaService } from "./agenda.service";

/** Ajanda (takvim görev/not) — `/v1/panel/agenda`. */
@ApiTags("panel/agenda")
@Controller("v1/panel/agenda")
export class AgendaController {
  constructor(private readonly service: AgendaService) {}

  @Get()
  @RequirePermission("agenda:read")
  @ApiOperation({ summary: "Tarih aralığındaki görev ve notlar (kişisel + paylaşılan)" })
  range(@Query(new ZodQueryPipe(agendaRangeQuery)) q: { from: string; to: string; unitId?: string }) {
    return this.service.range(q.from, q.to, q.unitId);
  }

  @Get("notes")
  @RequirePermission("agenda:read")
  @ApiOperation({ summary: "Son notlar (üst bar)" })
  notes() {
    return this.service.notes();
  }

  @Get(":id")
  @RequirePermission("agenda:read")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission("agenda:write")
  create(@Body(new ZodBodyPipe(agendaWrite)) dto: AgendaWrite) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("agenda:write")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(agendaWrite)) dto: AgendaWrite,
  ) {
    return this.service.update(id, dto);
  }

  @Post(":id/done")
  @RequirePermission("agenda:write")
  done(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(agendaDone)) dto: { done: boolean },
  ) {
    return this.service.setDone(id, dto.done);
  }

  @Delete(":id")
  @RequirePermission("agenda:write")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
