import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { migrationCommit, type MigrationCommit } from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { IntegrationService } from "./integration.service";

/** Panel iç BFF yüzeyi — banka mutabakatı ve veri göçü. */
@ApiTags("panel/integration")
@Controller("v1/panel")
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  @Get("bank")
  @RequirePermission("bank:read")
  @ApiOperation({
    summary: "Banka hesapları, hareketler ve mutabakat sorunları",
    description:
      "IBAN yalnız maskeli döner; eşleştirme blind index ile sunucuda yapılır.",
  })
  bank() {
    return this.service.bankOverview();
  }

  @Get("migrations")
  @RequirePermission("unit:write")
  migrations() {
    return this.service.migrations();
  }

  @Post("migrations")
  @RequirePermission("unit:write")
  @ApiOperation({
    summary: "Göçü uygula",
    description:
      "Dosya sunucuda **yeniden** ayrıştırılır; istemcinin hazır satırlarına " +
      "güvenmek önizlemeyle yazılanın ayrışmasına kapı açardı. Tamamı tek " +
      "transaction: yarım kalmış göç kabul edilemez.",
  })
  commitMigration(
    @Body(new ZodBodyPipe(migrationCommit)) dto: MigrationCommit,
  ) {
    return this.service.commitMigration(dto);
  }
}
