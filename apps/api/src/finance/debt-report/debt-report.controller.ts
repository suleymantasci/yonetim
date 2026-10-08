import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { debtMatrixQuery, openItemsQuery, receiptListQuery } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { DebtReportService } from "./debt-report.service";

/** Borç raporları — `/v1/panel/reports/debts/*` (`report:read`). */
@ApiTags("panel/reports")
@Controller("v1/panel/reports/debts")
export class DebtReportController {
  constructor(private readonly service: DebtReportService) {}

  @Get("matrix")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Daire/üye × ay borç tablosu (kalan, tahakkuk, ödenen)" })
  matrix(@Query() query: Record<string, string>) {
    return this.service.matrix(debtMatrixQuery.parse(query));
  }

  @Get("open-items")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Toplu borç dökümü — daire başına açık kalemler" })
  openItems(@Query() query: Record<string, string>) {
    const q = openItemsQuery.parse(query);
    return this.service.openItems({ member: q.member, unitId: q.unitId, overdueOnly: q.overdueOnly === "1" });
  }

  @Get("receipts")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Toplu tahsilat makbuzu dökümü" })
  receipts(@Query() query: Record<string, string>) {
    return this.service.receipts(receiptListQuery.parse(query));
  }
}
