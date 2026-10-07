import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { baBsQuery, mizanQuery } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { AccountingService } from "./accounting.service";

/** Muhasebe raporları — sentetik mizan ve BA/BS. */
@ApiTags("panel/reports")
@Controller("v1/panel/reports/accounting")
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get("mizan")
  @RequirePermission("report:read")
  @ApiOperation({
    summary: "Dönem mizanı (sentetik çift kayıt)",
    description: "Borç/tahsilat/gider kayıtlarından Tek Düzen Hesap Planı kodlarına türetilir.",
  })
  mizan(@Query() query: Record<string, string>) {
    const input = mizanQuery.parse(query);
    return this.service.mizan(input.from, input.to);
  }

  @Get("ba-bs")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Aylık BA/BS listesi (KDV hariç 5.000 TL eşiği)" })
  baBs(@Query() query: Record<string, string>) {
    return this.service.baBs(baBsQuery.parse(query).period);
  }
}
