import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  debtAdjust,
  debtBulkCreate,
  debtCancel,
  debtCreate,
  debtExemptPatch,
  debtListQuery,
  paymentCollect,
  paymentVoid,
  unitDebtSummaryQuery,
  type DebtAdjust,
  type DebtBulkCreate,
  type DebtCreate,
  type DebtListQuery,
  type PaymentCollect,
  type PaymentVoid,
  type UnitDebtSummaryQuery,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import { DebtService } from "./debt.service";

/**
 * Panel iç BFF yüzeyi — `/v1/panel/debts` (MIMARI-PLAN §9.1).
 *
 * Yetkiler ayrık: okuma `debt:read`, yazma `debt:write`, tahsilat
 * `payment:create`. Muhasebeciye tahsilat açıp borç düzeltmeyi kapatmak
 * mümkün olsun diye (`packages/core/rbac` matrisi bunu zaten ayırıyor).
 */
@ApiTags("panel/debts")
@Controller("v1/panel/debts")
export class DebtController {
  constructor(private readonly service: DebtService) {}

  @Get()
  @RequirePermission("debt:read")
  @ApiOperation({
    summary: "Borç listesi — satır, facet ve toplam tek yanıtta",
    description:
      "Ekran odaklı uç (§9.2a): liste, blok/dönem facet'leri ve filtreden " +
      "bağımsız özet toplamlar tek turda döner.",
  })
  list(@Query(new ZodQueryPipe(debtListQuery)) q: DebtListQuery) {
    return this.service.list(q);
  }

  /** Denetim ekranı ve dashboard şeffaflık akışı — GAP 5.2. */
  @Get("changes")
  @RequirePermission("debt:read")
  changes(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.changeFeed(Math.min(Math.max(limit, 1), 200));
  }

  /** Borçlar ekranının "daire" sekmesi — satır = daire. */
  @Get("unit-summary")
  @RequirePermission("debt:read")
  @ApiOperation({
    summary: "Daire bazlı borç özeti + bakiye trendi",
    description:
      "Her satır son 6 ayın ay sonu bakiyesini de taşır. `minOutstanding` " +
      "(kuruş) verilirse kalan borcu eşiğin altındaki daireler hiç dönmez — " +
      "borç listesindeki eşikle aynı anlam.",
  })
  unitSummary(
    @Query(new ZodQueryPipe(unitDebtSummaryQuery)) q: UnitDebtSummaryQuery,
  ) {
    return this.service.unitSummary(q);
  }

  /** Tahsilat formunun ihtiyacı: bir birimin açık borçları. */
  @Get("open/:unitId")
  @RequirePermission("debt:read")
  openDebts(@Param("unitId", ParseUUIDPipe) unitId: string) {
    return this.service.openDebts(unitId);
  }

  @Post("bulk/preview")
  @RequirePermission("debt:write")
  @ApiOperation({
    summary: "Toplu borçlandırma önizlemesi",
    description:
      "Hiçbir şey yazmaz. Önizleme ve yazma **aynı** dağıtım fonksiyonunu " +
      "kullandığı için gösterilenle oluşturulan birebir aynıdır.",
  })
  preview(@Body(new ZodBodyPipe(debtBulkCreate)) dto: DebtBulkCreate) {
    return this.service.preview(dto);
  }

  @Post("bulk")
  @RequirePermission("debt:write")
  bulkCreate(@Body(new ZodBodyPipe(debtBulkCreate)) dto: DebtBulkCreate) {
    return this.service.bulkCreate(dto);
  }

  @Post("collect")
  @RequirePermission("payment:create")
  collect(@Body(new ZodBodyPipe(paymentCollect)) dto: PaymentCollect) {
    return this.service.collect(dto);
  }

  /**
   * Tahsilat iptali — `payment:refund`: yönetici; muhasebeci ve firma
   * operatöründe yok. Tahsilatı giren kişinin kendi kaydını tek başına geri
   * alamaması bilinçli (dört göz).
   */
  @Post("payments/:id/void")
  @RequirePermission("payment:refund")
  @ApiOperation({
    summary: "Tahsilat iptali (ters kayıt)",
    description:
      "Yalnız panelden girilmiş (manual) ve tamamlanmış tahsilat. Kayıt silinmez; " +
      "durum `cancelled` olur, mahsuplar geri alınır, kapanan borçlar yeniden açılır. " +
      "Kart ödemesi için sağlayıcı iadesi gerekir.",
  })
  voidPayment(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(paymentVoid)) dto: PaymentVoid,
  ) {
    return this.service.voidPayment(id, dto.reason);
  }

  @Post("cancel")
  @RequirePermission("debt:write")
  @ApiOperation({
    summary: "Borç iptali (soft-delete)",
    description:
      "Gerekçe zorunlu (en az 10 karakter). Kısmen bile ödenmiş borç iptal " +
      "edilmez; sonuçta `affected < requested` olarak görünür.",
  })
  cancel(
    @Body(new ZodBodyPipe(debtCancel)) dto: { ids: string[]; reason: string },
  ) {
    return this.service.cancel(dto.ids, dto.reason);
  }

  @Patch("late-fee-waiver")
  @RequirePermission("debt:write")
  exempt(
    @Body(new ZodBodyPipe(debtExemptPatch))
    dto: {
      ids: string[];
      exempt: boolean;
    },
  ) {
    return this.service.setLateFeeExempt(dto.ids, dto.exempt);
  }

  @Get(":id")
  @RequirePermission("debt:read")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission("debt:write")
  create(@Body(new ZodBodyPipe(debtCreate)) dto: DebtCreate) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("debt:write")
  @ApiOperation({
    summary: "Borç düzeltme",
    description:
      "GAP-DURUM kararı 9: `reason` en az 10 karakter. Gerekçe " +
      "`app.change_reason` oturum değişkenine yazılır ve DB trigger'ı onu " +
      "sakine gösterilen değişiklik tarihçesine taşır.",
  })
  adjust(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(debtAdjust)) dto: DebtAdjust,
  ) {
    return this.service.adjust(id, dto);
  }
}
