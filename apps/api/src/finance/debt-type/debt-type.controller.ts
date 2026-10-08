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

import { debtTypeSave, type DebtTypeSave } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { DebtTypeService } from "./debt-type.service";

/**
 * Borç türü tanımları — `/v1/panel/debt-types`.
 *
 * Okuma `debt:read` (borç formları türleri listeler), yazma `settings:write`:
 * borçlu kuralı ve gecikme oranı sitenin kuralı, tek borç girişi değil.
 */
@ApiTags("panel/debt-types")
@Controller("v1/panel/debt-types")
export class DebtTypeController {
  constructor(private readonly service: DebtTypeService) {}

  @Get()
  @RequirePermission("debt:read")
  @ApiOperation({ summary: "Borç türleri (yoksa varsayılanlar oluşturulur)" })
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Borç türü ekle" })
  create(@Body(new ZodBodyPipe(debtTypeSave)) dto: DebtTypeSave) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("settings:write")
  @ApiOperation({ summary: "Borç türünü güncelle" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(debtTypeSave)) dto: DebtTypeSave,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  @RequirePermission("settings:write")
  @ApiOperation({
    summary: "Borç türünü sil",
    description: "Bağlı borcu olan tür silinmez (409) — pasifleştirin.",
  })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
