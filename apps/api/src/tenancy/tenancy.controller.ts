import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../identity/decorators";
import { TenancyService } from "./tenancy.service";

/** Panel iç BFF yüzeyi — site ayarları ve personel. */
@ApiTags("panel/tenancy")
@Controller("v1/panel")
export class TenancyController {
  constructor(private readonly service: TenancyService) {}

  @Get("settings")
  @RequirePermission("settings:read")
  settings() {
    return this.service.settings();
  }

  @Get("staff")
  @RequirePermission("staff:read")
  @ApiOperation({
    summary: "Personel listesi ve puantaj",
    description:
      "Şifreli TCKN/IBAN **dönmez**; yalnız 'kayıtlı mı' bilgisi. Panelin " +
      "ekranı bordro tutarlarına ihtiyaç duyuyor, kimlik numarasına değil.",
  })
  staff() {
    return this.service.staff();
  }
}
