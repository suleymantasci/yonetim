import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  blockCreate,
  blockUpdate,
  unitBulkCreate,
  unitBulkPatch,
  unitCreate,
  unitIds,
  unitListQuery,
  type BlockCreate,
  type BlockUpdate,
  type UnitBulkCreate,
  type UnitBulkPatch,
  type UnitCreate,
  type UnitListQuery,
} from "@yonetim/contracts";

import { ChangeReason, RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import { BlockService } from "../block/block.service";
import { UnitService } from "./unit.service";

/**
 * Panel iç BFF yüzeyi — `/v1/panel/*` (MIMARI-PLAN §9.1).
 *
 * **Serbest**: ekran değişince uç değişir, sürüm garantisi yok. İstemcisi aynı
 * repoda olduğu için kayma derleme zamanında yakalanıyor. Dış sözleşme
 * (`/v1/units`) ayrı bir controller'da ve **donuk**.
 */
@ApiTags("panel/units")
@Controller("v1/panel/units")
export class UnitController {
  constructor(
    private readonly service: UnitService,
    private readonly blocks: BlockService,
  ) {}

  @Get()
  @RequirePermission("unit:read")
  @ApiOperation({
    summary: "Birim listesi — satır, facet ve toplam tek yanıtta",
    description:
      "Ekran odaklı uç (§9.2a): liste, blok facet'i, çöp kutusu sayacı ve site " +
      "geneli toplamlar tek turda döner. Panel bu ekran için tek çağrı yapar.",
  })
  list(@Query(new ZodQueryPipe(unitListQuery)) q: UnitListQuery) {
    return this.service.list(q);
  }

  /** Combobox verisi — borç/gider ekranları da tüketiyor. */
  @Get("options")
  @RequirePermission("unit:read")
  options() {
    return this.service.options();
  }

  @Get("blocks")
  @RequirePermission("unit:read")
  blockList() {
    return this.blocks.list();
  }

  @Post("blocks")
  @RequirePermission("unit:write")
  createBlock(@Body(new ZodBodyPipe(blockCreate)) dto: BlockCreate) {
    return this.blocks.create(dto);
  }

  @Patch("blocks/:id")
  @RequirePermission("unit:write")
  updateBlock(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(blockUpdate)) dto: BlockUpdate,
  ) {
    return this.blocks.update(id, dto);
  }

  @Delete("blocks/:id")
  @RequirePermission("unit:write")
  deleteBlock(@Param("id", ParseUUIDPipe) id: string) {
    return this.blocks.softDelete(id);
  }

  /**
   * Toplu üretim önizlemesi — hiçbir şey yazmaz, yeni blok bile açmaz.
   * GAP-DURUM kararı 8 burada somutlaşıyor.
   */
  @Post("bulk/preview")
  @RequirePermission("unit:write")
  preview(@Body(new ZodBodyPipe(unitBulkCreate)) dto: UnitBulkCreate) {
    return this.service.preview(dto);
  }

  @Post("bulk")
  @RequirePermission("unit:write")
  @ApiOperation({
    summary: "Toplu birim üretimi",
    description: "`confirmed: false` ise 400 `preview_required` döner.",
  })
  bulkCreate(@Body(new ZodBodyPipe(unitBulkCreate)) dto: UnitBulkCreate) {
    return this.service.bulkCreate(dto);
  }

  @Patch("bulk")
  @RequirePermission("unit:write")
  bulkPatch(
    @Body(new ZodBodyPipe(unitBulkPatch)) dto: UnitBulkPatch,
    @ChangeReason() reason: string,
  ) {
    return this.service.bulkPatch(dto, reason);
  }

  @Post("trash")
  @RequirePermission("unit:write")
  softDelete(@Body(new ZodBodyPipe(unitIds)) dto: { ids: string[] }) {
    return this.service.softDelete(dto.ids);
  }

  @Post("restore")
  @RequirePermission("unit:write")
  restore(@Body(new ZodBodyPipe(unitIds)) dto: { ids: string[] }) {
    return this.service.restore(dto.ids);
  }

  @Get(":id")
  @RequirePermission("unit:read")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission("unit:write")
  create(@Body(new ZodBodyPipe(unitCreate)) dto: UnitCreate) {
    return this.service.create(dto);
  }

  @Patch(":id")
  @RequirePermission("unit:write")
  @ApiOperation({
    summary: "Birim güncelleme",
    description:
      "`X-Change-Reason` başlığı zorunlu (en az 10 karakter). Gerekçe DB " +
      "oturum değişkenine yazılır ve denetim trigger'ı tarafından kütüğe geçer.",
  })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(unitCreate)) dto: UnitCreate,
    @ChangeReason() reason: string,
  ) {
    return this.service.update(id, dto, reason);
  }
}
