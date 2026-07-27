import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { auditListQuery, type AuditListQuery } from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodQueryPipe } from "../../infra/zod/zod-dto";
import { AuditReadService } from "./audit-read.service";

/**
 * Denetim kütüğü — `/v1/panel/audit`.
 *
 * **Salt okunur, bilinçli olarak.** Kütük append-only (DB trigger'ı
 * UPDATE/DELETE'i engelliyor) ve kayıtlar yalnız iş akışının içinden
 * yazılıyor. Buraya bir yazma ucu eklemek, uydurulmuş bir satırı gerçek
 * olandan ayırt edilemez kılardı.
 */
@ApiTags("panel/audit")
@Controller("v1/panel/audit")
export class AuditController {
  constructor(private readonly service: AuditReadService) {}

  @Get()
  @RequirePermission("audit:read")
  @ApiOperation({
    summary: "Denetim kaydı listesi",
    description:
      "Listede diff'in kendisi değil kaç alanın değiştiği döner; ham diff " +
      "kişisel veri taşıyabildiği için yalnız detay ucunda.",
  })
  list(@Query(new ZodQueryPipe(auditListQuery)) q: AuditListQuery) {
    return this.service.list(q);
  }

  @Get(":id")
  @RequirePermission("audit:read")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
}
