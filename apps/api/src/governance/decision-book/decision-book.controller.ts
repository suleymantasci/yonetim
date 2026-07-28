import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  decisionBookQuery,
  decisionEntryCreate,
  type DecisionBookQuery,
  type DecisionEntryCreate,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import { DecisionBookService } from "./decision-book.service";

/**
 * Karar Defteri — `/v1/panel/decision-book` (KMK md.32).
 *
 * **Yalnız iki uç var ve bu bilinçli**: okuma ve ekleme. Güncelleme ve silme
 * ucu yok çünkü defter ekleme-yalnız; yanlış karar düzeltilmez, düzelten yeni
 * bir karar yazılır. Veritabanı trigger'ı da bunu ayrıca engelliyor —
 * "unutulan bir kontrol" ihtimali bırakılmadı.
 *
 * Okuma yetkisi (`decision:read`) sakin rolünde de var: KMK md.32/son kat
 * malikine kararları görme hakkı tanıyor (bkz. `packages/core/rbac`).
 */
@ApiTags("panel/decision-book")
@Controller("v1/panel/decision-book")
export class DecisionBookController {
  constructor(private readonly service: DecisionBookService) {}

  @Get()
  @RequirePermission("decision:read")
  @ApiOperation({
    summary: "Karar defteri — kayıtlar, yıl facet'i ve sıradaki numara",
    description:
      "Ekran odaklı uç (§9a): kayıtlar, yıl listesi, toplantı seçenekleri ve " +
      "sıradaki defter numarası tek turda döner. Oy değerleri **metin** " +
      "olarak taşınır: arsa payı ağırlıklı oy kesirlidir ve `number` " +
      "üzerinden geçirmek yuvarlama kaybı demektir.",
  })
  list(@Query(new ZodQueryPipe(decisionBookQuery)) q: DecisionBookQuery) {
    return this.service.list(q);
  }

  @Post()
  @RequirePermission("decision:write")
  @ApiOperation({
    summary: "Deftere karar yaz",
    description:
      "Defter numarası **sunucu** tarafından verilir; istemciden alınmaz. " +
      "Eşzamanlı iki kayıtta tekil index ikincisini reddeder ve servis " +
      "yeniden numara alır — defterde atlanan numara bırakılmaz.",
  })
  create(
    @Body(new ZodBodyPipe(decisionEntryCreate)) dto: DecisionEntryCreate,
  ) {
    return this.service.create(dto);
  }
}
