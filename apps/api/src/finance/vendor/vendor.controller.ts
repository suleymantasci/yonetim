import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { vendorSave, type VendorSave } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { VendorService } from "./vendor.service";

/** Tedarikçi kartı ve cari ekstresi — `/v1/panel/vendors`. */
@ApiTags("panel/vendors")
@Controller("v1/panel/vendors")
export class VendorController {
  constructor(private readonly service: VendorService) {}

  @Get()
  @RequirePermission("vendor:read")
  @ApiOperation({ summary: "Tedarikçiler + bakiye (giderlerden türetilir)" })
  list() {
    return this.service.list();
  }

  @Get("options")
  @RequirePermission("expense:write")
  options() {
    return this.service.options();
  }

  @Get(":id")
  @RequirePermission("vendor:read")
  @ApiOperation({ summary: "Tedarikçi kartı + cari ekstresi" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission("vendor:write")
  create(@Body(new ZodBodyPipe(vendorSave)) dto: VendorSave) {
    return this.service.save(dto);
  }

  @Patch(":id")
  @RequirePermission("vendor:write")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(vendorSave)) dto: VendorSave) {
    return this.service.save(dto, id);
  }

  @Delete(":id")
  @RequirePermission("vendor:write")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(":id/link-expenses")
  @RequirePermission("vendor:write")
  @ApiOperation({
    summary: "Adı eşleşen bağlanmamış giderleri karta bağla",
    description: "Kart sonradan açıldığında geçmiş giderlerin cariye girmesi için.",
  })
  linkExpenses(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.linkByName(id);
  }
}
