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
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  duesPlanRunRequest,
  duesPlanSave,
  duesPlanTogglePatch,
  type DuesPlanRunRequest,
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

  /**
   * Planı elle çalıştır — PROJE-DURUMU §5.4.
   *
   * Plan bugüne kadar yalnız worker'ın cron'uyla çalışıyordu; ayın ortasında
   * kurulan bir sitede yönetici bir sonraki ayı beklemek zorunda kalıyor ve
   * aynı borçları toplu borçlandırmadan elle giriyordu.
   */
  @Post(":id/calistir")
  @RequirePermission("dues:write")
  @ApiOperation({
    summary: "Aidat planını şimdi çalıştır",
    description:
      "Üretim mantığı `packages/jobs` içindeki **aynı** fonksiyondan gelir; " +
      "ikinci bir uygulama, elle çalıştırmayla cron'un zamanla ayrışması " +
      "demekti. `dryRun` varsayılan olarak açıktır: borç üretmek geri " +
      "alınması pahalı bir iş. İdempotanslık `dues_runs` (plan, dönem) " +
      "tekil indeksinden gelir — iki kez basmak ikinci bir borç dalgası " +
      "üretmez.",
  })
  run(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(duesPlanRunRequest)) dto: DuesPlanRunRequest,
  ) {
    return this.service.run(id, dto);
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
