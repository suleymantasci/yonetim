import { Module } from "@nestjs/common";

import { BlockService } from "./block/block.service";
import { BulkUnitBuilder } from "./unit/unit-bulk.service";
import { UnitController } from "./unit/unit.controller";
import { UnitRepository } from "./unit/unit.repository";
import { UnitService } from "./unit/unit.service";

/**
 * `property` bağlamı — blok, birim, sakin, adres, sayaç (MIMARI-PLAN §6.3).
 * A1'de blok + birim; sakin A3'te, sayaç Track E'de eklenir.
 */
@Module({
  controllers: [UnitController],
  providers: [UnitService, UnitRepository, BulkUnitBuilder, BlockService],
  exports: [UnitService, UnitRepository],
})
export class PropertyModule {}
