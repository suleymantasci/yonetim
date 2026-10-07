import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { baBsQuery, journalQuery, mizanQuery, openingSave, type OpeningSave } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { AccountingService } from "./accounting.service";
import { OpeningService } from "./opening.service";

/** Muhasebe raporları — sentetik mizan ve BA/BS. */
@ApiTags("panel/reports")
@Controller("v1/panel/reports/accounting")
export class AccountingController {
  constructor(
    private readonly service: AccountingService,
    private readonly opening: OpeningService,
  ) {}

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

  @Get("journal")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Yevmiye defteri — aralıktaki fişler (en çok 1500)" })
  journal(@Query() query: Record<string, string>) {
    const input = journalQuery.parse(query);
    return this.service.journal(input.from, input.to);
  }

  @Get("opening")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Açılış fişi — geçiş tarihindeki bakiyeler" })
  getOpening() {
    return this.opening.get();
  }

  @Put("opening")
  @RequirePermission("settings:write")
  @ApiOperation({
    summary: "Açılış fişini kaydet",
    description:
      "Kasa/banka/tedarikçi muhasebe açılışı, personel açılış bakiyeleri ve " +
      "sakin devir borçları (gerçek borç). Tahsilat almış devir borcu değişmez.",
  })
  saveOpening(@Body(new ZodBodyPipe(openingSave)) dto: OpeningSave) {
    return this.opening.save(dto);
  }
}
