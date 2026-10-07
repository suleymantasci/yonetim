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
  budgetApprove,
  budgetSave,
  budgetToDuesPlan,
  type BudgetApprove,
  type BudgetSave,
  type BudgetToDuesPlan,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { BudgetService } from "./budget.service";

/** İşletme projesi (KMK 37) — `/v1/panel/budgets`. */
@ApiTags("panel/budgets")
@Controller("v1/panel/budgets")
export class BudgetController {
  constructor(private readonly service: BudgetService) {}

  @Get()
  @RequirePermission("report:read")
  @ApiOperation({ summary: "İşletme projeleri + plan/gerçekleşen toplamları" })
  list() {
    return this.service.list();
  }

  @Get("options")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Proje formu için gider kategorileri" })
  options() {
    return this.service.options();
  }

  @Get(":id")
  @RequirePermission("report:read")
  @ApiOperation({
    summary: "Proje kalemleri, gerçekleşen ve daire başı aylık avans dağılımı",
  })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission("dues:write")
  create(@Body(new ZodBodyPipe(budgetSave)) dto: BudgetSave) {
    return this.service.save(dto);
  }

  @Patch(":id")
  @RequirePermission("dues:write")
  @ApiOperation({ summary: "Taslak projeyi güncelle (onaylı proje değişmez)" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(budgetSave)) dto: BudgetSave,
  ) {
    return this.service.save(dto, id);
  }

  @Post(":id/approve")
  @RequirePermission("dues:write")
  @ApiOperation({ summary: "Genel kurul onayı — proje kilitlenir" })
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(budgetApprove)) dto: BudgetApprove,
  ) {
    return this.service.approve(id, dto);
  }

  @Post(":id/dues-plan")
  @RequirePermission("dues:write")
  @ApiOperation({ summary: "Onaylı projeden aylık aidat planı üret" })
  toDuesPlan(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(budgetToDuesPlan)) dto: BudgetToDuesPlan,
  ) {
    return this.service.toDuesPlan(id, dto);
  }

  @Delete(":id")
  @RequirePermission("dues:write")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
