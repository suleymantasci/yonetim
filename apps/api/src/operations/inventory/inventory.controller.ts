import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  inventorySave,
  inventoryStatusPatch,
  type InventorySave,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { InventoryService } from "./inventory.service";

/**
 * Demirbaş defteri — `/v1/panel/inventory` (KMK md.34/9).
 *
 * Silme ucu **yok** ve olmayacak: demirbaş defteri bir tarihçe. Elden çıkan
 * kalem `status` ile düşülüyor (`disposed`/`lost`), satır kalıyor.
 */
@ApiTags("panel/inventory")
@Controller("v1/panel/inventory")
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission("inventory:read")
  @ApiOperation({
    summary: "Demirbaş listesi + sayaçlar + zimmet seçenekleri",
    description:
      "Ekran odaklı uç (§9a): liste, aktif personel seçenekleri ve sayaçlar " +
      "tek turda döner. `warrantyExpired` sunucu saatine göre hesaplanır.",
  })
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermission("inventory:write")
  @ApiOperation({
    summary: "Demirbaş kaydet (`id` varsa günceller)",
    description:
      "Envanter numarası site içinde tekildir; çakışma 409 döner. Kayıt " +
      "silinmez — elden çıkan kalem `status` ile düşülür.",
  })
  save(@Body(new ZodBodyPipe(inventorySave)) dto: InventorySave) {
    return this.service.save(dto);
  }

  @Patch("status")
  @RequirePermission("inventory:write")
  @ApiOperation({
    summary: "Toplu durum değişikliği — yıl sonu sayımının çıktısı",
  })
  setStatus(
    @Body(new ZodBodyPipe(inventoryStatusPatch))
    dto: { ids: string[]; status: InventorySave["status"] },
  ) {
    return this.service.setStatus(dto.ids, dto.status);
  }
}
