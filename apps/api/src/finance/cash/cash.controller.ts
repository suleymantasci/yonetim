import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  cashHandoverCreate,
  cashIncomeCreate,
  cashTransferCreate,
  cashVoid,
  incomeGroupSave,
  type CashHandoverCreate,
  type CashIncomeCreate,
  type CashTransferCreate,
  type CashVoid,
  type IncomeGroupSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { CashService, IncomeGroupService } from "./cash.service";

/** Kasa işlemleri — `/v1/panel/cash`. */
@ApiTags("panel/cash")
@Controller("v1/panel/cash")
export class CashController {
  constructor(
    private readonly service: CashService,
    private readonly groups: IncomeGroupService,
  ) {}

  @Get()
  @RequirePermission("bank:read")
  @ApiOperation({
    summary: "Kasa/banka bakiyeleri (fiş listesinden) ve son kasa hareketleri",
  })
  overview() {
    return this.service.overview();
  }

  @Post("transfers")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Virman — kasa/banka hesapları arası para transferi",
  })
  transfer(@Body(new ZodBodyPipe(cashTransferCreate)) dto: CashTransferCreate) {
    return this.service.transfer(dto);
  }

  @Post("incomes")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Harici tahsilat — aidat dışı gelir (kira, reklam, faiz…)",
  })
  income(@Body(new ZodBodyPipe(cashIncomeCreate)) dto: CashIncomeCreate) {
    return this.service.income(dto);
  }

  @Post("income-groups")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Harici tahsilat grubu ekle (hesap kodu boşsa 602.1x)" })
  createGroup(@Body(new ZodBodyPipe(incomeGroupSave)) dto: IncomeGroupSave) {
    return this.groups.create(dto);
  }

  @Patch("income-groups/:id")
  @RequirePermission("bank:write")
  @ApiOperation({ summary: "Harici tahsilat grubunu güncelle (ad, aktiflik)" })
  updateGroup(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(incomeGroupSave)) dto: IncomeGroupSave) {
    return this.groups.update(id, dto);
  }

  @Post("movements/:id/void")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Kasa hareketini iptal et (silinmez, defterden düşer)",
  })
  void(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(cashVoid)) dto: CashVoid,
  ) {
    return this.service.void(id, dto.reason);
  }

  @Get("handovers")
  @RequirePermission("bank:read")
  handovers() {
    return this.service.handovers();
  }

  @Get("handovers/:id")
  @RequirePermission("bank:read")
  handover(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.handover(id);
  }

  @Post("handovers")
  @RequirePermission("bank:write")
  @ApiOperation({
    summary: "Kasa devir tutanağı — o günün bakiyeleri dondurulur",
  })
  createHandover(
    @Body(new ZodBodyPipe(cashHandoverCreate)) dto: CashHandoverCreate,
  ) {
    return this.service.createHandover(dto);
  }
}
