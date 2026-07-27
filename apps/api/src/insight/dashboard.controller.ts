import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../identity/decorators";
import { DashboardService } from "./dashboard.service";

/** Panel iç BFF yüzeyi — `/v1/panel/dashboard`. */
@ApiTags("panel/dashboard")
@Controller("v1/panel/dashboard")
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  // `report:read`: panel bir rapor yüzeyi ve bu izin panele erişen her rolde
  // var (yönetici, denetçi, muhasebeci). Ayrı bir `dashboard:read` icat etmek,
  // pratikte hiçbir şeyi ayırmayan bir izin eklemek olurdu.
  @RequirePermission("report:read")
  @ApiOperation({
    summary: "Kontrol paneli — özet, grafikler ve aktivite tek yanıtta",
    description:
      "MIMARI-PLAN §9a: bir ekran = bir çağrı. Üç ayrı uca bölmek panel " +
      "açılışını üç gidiş-dönüşe çıkarırdı. Site boşken `charts` null döner.",
  })
  overview() {
    return this.service.overview();
  }
}
