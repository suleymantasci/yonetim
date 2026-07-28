import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { severanceQuote, type SeveranceQuote } from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
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

  /**
   * Kıdem/ihbar tazminatı hesaplayıcı.
   *
   * `staff:read` değil **`staff:payroll`**: sonuç ücret bilgisinin türevi ve
   * bu yetki `company_operator` rolünden bilinçli olarak esirgenmiş.
   *
   * `POST`, çünkü hesap girdileri (fesih tarihi, ücret ezmesi, hakların doğup
   * doğmadığı) bir sorgu dizesine sığmıyor ve senaryo denemesi bir kaynak
   * okuması değil. Hiçbir şey yazmıyor.
   */
  @Post("staff/tazminat")
  @RequirePermission("staff:payroll")
  @ApiOperation({
    summary: "Kıdem ve ihbar tazminatı hesabı (yaklaşık)",
    description:
      "Kanunda sabit olanlar (30 gün/yıl, ihbar kademeleri, damga vergisi " +
      "binde 7,59, kıdemin gelir vergisi istisnası) `packages/core` içinde " +
      "ve test altında. Tavan ile gelir vergisi oranı yapılandırmadan gelir; " +
      "yürürlük tarihi yanıtta döner. Gelir vergisi tek marjinal oranla " +
      "hesaplandığı için sonuç **yaklaşıktır**, bordro değildir.",
  })
  severanceQuote(@Body(new ZodBodyPipe(severanceQuote)) dto: SeveranceQuote) {
    return this.service.severanceQuote(dto);
  }
}
