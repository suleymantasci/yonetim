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
  severanceQuote,
  staffSave,
  tenantSettingsSave,
  type SeveranceQuote,
  type StaffSave,
  type TenantSettingsSave,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { SettingsWriteService } from "./settings-write.service";
import { StaffWriteService } from "./staff-write.service";
import { TenancyService } from "./tenancy.service";

/** Panel iç BFF yüzeyi — site ayarları ve personel. */
@ApiTags("panel/tenancy")
@Controller("v1/panel")
export class TenancyController {
  constructor(
    private readonly service: TenancyService,
    private readonly staffWrite: StaffWriteService,
    private readonly settingsWrite: SettingsWriteService,
  ) {}

  @Get("settings")
  @RequirePermission("settings:read")
  settings() {
    return this.service.settings();
  }

  @Patch("settings")
  @RequirePermission("settings:write")
  @ApiOperation({
    summary: "Site ayarlarını güncelle",
    description:
      "`settings` JSONB **birleştirilir**, ezilmez: sözlükte bu formun " +
      "bilmediği anahtarlar da var (marka, landing görseli…) ve nesneyi " +
      "baştan yazmak onları sessizce silerdi. `slug`, `unitCount` ve " +
      "abonelik alanları bilinçle dışarıda — ilki basılmış bağlantıları " +
      "kırar, ikincisi `units` tablosundan türeyen bir sayı, üçüncüsü " +
      "faturalandırmanın sonucu.",
  })
  updateSettings(
    @Body(new ZodBodyPipe(tenantSettingsSave)) dto: TenantSettingsSave,
  ) {
    return this.settingsWrite.save(dto);
  }

  /**
   * Entegrasyonların **gerçek** durumu — PROJE-DURUMU §5.5.
   *
   * Ayarlar ekranı bugüne kadar `siteConfig.features` içindeki derleme
   * zamanı sabitlerini gösteriyordu: "WhatsApp: aktif" rozeti site hakkında
   * hiçbir şey söylemiyor, ürün hakkında konuşuyordu.
   */
  @Get("settings/integrations")
  @RequirePermission("settings:read")
  @ApiOperation({
    summary: "Entegrasyon bağlantı durumları",
    description:
      "Her satır üçünü ayırır: kimlik bilgisi tanımlı mı (`configured`), " +
      "nereden geliyor (`scope`: site ayarı / platform ortamı) ve son " +
      "ölçülen sonuç (`state`). WhatsApp'ta `scope` karma modelin hangi " +
      "numarasının kullanıldığını söyler.",
  })
  integrations() {
    return this.settingsWrite.integrations();
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
   * Personel oluşturma ve güncelleme.
   *
   * `tazminat` ucuyla aynı önek altında ama **farklı yetki**: kayıt açmak
   * `staff:write`, tazminat hesabı `staff:payroll`. İkincisi ücret bilgisinin
   * türevi ve `company_operator` rolünden bilinçle esirgenmiş; personel
   * kaydı açmak ise operasyonel bir iş.
   */
  @Post("staff")
  @RequirePermission("staff:write")
  @ApiOperation({
    summary: "Personel kaydı oluştur",
    description:
      "TCKN/IBAN şifrelenerek yazılır ve hiçbir okuma ucundan geri dönmez; " +
      "yalnız 'kayıtlı mı' bilgisi görünür. Net ücret ve SGK primi " +
      "**girilir, hesaplanmaz** — gerçek bordro mali müşavirin ürettiği " +
      "belgedir ve ikinci bir hesap onunla çelişirdi.",
  })
  createStaff(@Body(new ZodBodyPipe(staffSave)) dto: StaffSave) {
    return this.staffWrite.save(dto);
  }

  /**
   * Düzenleme formunu dolduran tek satır okuması.
   *
   * Listeden ayrı bir uç, çünkü telefon burada **ham** dönüyor: maskeli
   * numarayla doldurulmuş bir form kaydedildiğinde maske numaranın yerine
   * yazılırdı. `staff:write` isteniyor, `staff:read` değil — bu uç yalnız
   * düzenleme niyetiyle çağrılıyor.
   */
  @Get("staff/:id")
  @RequirePermission("staff:write")
  @ApiOperation({ summary: "Personel detayı (düzenleme formu için)" })
  staffDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.staffWrite.detail(id);
  }

  @Patch("staff/:id")
  @RequirePermission("staff:write")
  @ApiOperation({
    summary: "Personel kaydını güncelle",
    description:
      "TCKN/IBAN alanı **boş bırakılırsa mevcut kayıt korunur**; silmek " +
      "ayrı bir bayrakla (`clearTckn`/`clearIban`) istenir. Ayrılış tarihi " +
      "girilirse kayıt otomatik pasife düşer.",
  })
  updateStaff(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(staffSave)) dto: StaffSave,
  ) {
    return this.staffWrite.save(dto, id);
  }

  /**
   * Kayıt silme — soft delete, ve normalde **kullanılmaması gereken** uç.
   *
   * Ayrılan personel için doğru işlem ayrılış tarihi girmek: puantaj, izin ve
   * zimmet kayıtları satıra bağlı ve iş hukuku uyuşmazlığında yıllar sonra
   * sorulabiliyor. Bu uç yalnız **yanlış açılmış** kayıt için var.
   */
  @Delete("staff/:id")
  @RequirePermission("staff:write")
  @ApiOperation({ summary: "Personel kaydını sil (yalnız hatalı kayıt için)" })
  deleteStaff(@Param("id", ParseUUIDPipe) id: string) {
    return this.staffWrite.remove(id);
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
  @Post("staff/severance")
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
