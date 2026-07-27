import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../identity/decorators";
import { OperationsService } from "./operations.service";

/**
 * Panel iç BFF yüzeyi — `/v1/panel/operations/*`.
 *
 * Dört ekranın dördü de "liste + üstünde sayaçlar" biçiminde; sayaçlar
 * yanıtın içinde geliyor (§9a) çünkü hepsi sunucu saatine göre hesaplanan
 * zaman karşılaştırmaları.
 */
@ApiTags("panel/operations")
@Controller("v1/panel/operations")
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get("talepler")
  @RequirePermission("request:read")
  @ApiOperation({
    summary: "Talep listesi + SLA sayaçları",
    description:
      "`slaBreached` sunucu saatine göre hesaplanır: saati şaşmış bir " +
      "tarayıcı 'gecikti mi' sorusuna yanlış cevap vermesin.",
  })
  requests() {
    return this.service.requests();
  }

  @Get("bakim")
  @RequirePermission("maintenance:read")
  @ApiOperation({
    summary: "Bakım planı + yasal şablon kütüphanesi",
    description:
      "Site kendi şablonlarını tanımlamadıysa yasal tohum listesi döner " +
      "(`templatesAreSeed: true`); boş liste zorunlu bakımları gizlerdi.",
  })
  maintenance() {
    return this.service.maintenance();
  }

  @Get("rezervasyon")
  @RequirePermission("reservation:read")
  reservations() {
    return this.service.reservations();
  }

  @Get("sayaclar")
  @RequirePermission("meter:read")
  meters() {
    return this.service.meters();
  }
}
