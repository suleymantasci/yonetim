import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { RequirePermission } from "../../identity/decorators";
import { JobRunService } from "./job-run.service";

/**
 * Uzun süren iş koşuları — `/v1/panel/job-runs` (MIMARI-PLAN §10 B3).
 *
 * Ekran bu ucu **yokluyor** (poll). WebSocket kurmak cazipti ama ilerleme
 * saniyede bir güncellenen bir sayı; kalıcı bağlantı açmanın maliyeti
 * kazancından büyük olurdu ve ters vekil arkasında ayrı bir yapılandırma
 * gerektirirdi. Yoklama aralığı istemcinin kararı.
 *
 * `report:read` yetkisi: koşu kaydı bir raporlama yüzeyi ve panele erişen her
 * rolde bu izin var. İptal daha dar (`report:export`) — başkasının başlattığı
 * bir göçü durdurmak salt okuma yetkisiyle yapılmamalı.
 */
@ApiTags("panel/job-runs")
@Controller("v1/panel/job-runs")
export class JobRunController {
  constructor(private readonly service: JobRunService) {}

  @Get()
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Son 20 iş koşusu" })
  list(@Query("kind") kind?: string) {
    return this.service.list(kind);
  }

  @Get(":id")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Koşu durumu ve ilerlemesi" })
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }

  @Post(":id/cancel")
  @HttpCode(202)
  // `report:export` — bir koşuyu iptal etmek raporlama yüzeyinde en yakın
  // "yazma" karşılığı olan izin. Yalnız iptal için yeni bir izin adı icat
  // etmek, pratikte hiçbir rolü diğerinden ayırmayan bir izin eklemek olurdu.
  @RequirePermission("report:export")
  @ApiOperation({
    summary: "İptal iste",
    description:
      "İptal bir **bayrak**: iş kendi döngüsünde okuyup temiz bir noktada " +
      "durur ve o ana kadar yaptığı kalıcı olur. Job'ı kuyruktan silmek, " +
      "yarısı yazılmış bir göçü geri alınamaz halde bırakırdı. Yanıt 202: " +
      "istek alındı, iş henüz durmadı.",
  })
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.cancel(id);
  }
}
