import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { teamInvite, teamRolePatch, type TeamInvite, type TeamRolePatch } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { TeamService } from "./team.service";

/** Program kullanıcıları — `/v1/panel/team` (`settings:*`). */
@ApiTags("panel/team")
@Controller("v1/panel/team")
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get()
  @RequirePermission("settings:read")
  @ApiOperation({ summary: "Panel ekibi (yönetici, muhasebeci, denetçi, personel)" })
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Kullanıcı davet et (telefon/e-posta ile kodla giriş)" })
  invite(@Body(new ZodBodyPipe(teamInvite)) dto: TeamInvite) {
    return this.service.invite(dto);
  }

  @Patch(":id")
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Rol değiştir (kendi rolü ve son yönetici hariç)" })
  changeRole(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(teamRolePatch)) dto: TeamRolePatch) {
    return this.service.changeRole(id, dto);
  }

  @Delete(":id")
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Erişimi kaldır (kendisi ve son yönetici hariç)" })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
