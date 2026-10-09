import { Module } from "@nestjs/common";

import { BlockService } from "./block/block.service";
import { AccessRequestService } from "./resident/access-request.service";
import { PiiService } from "./resident/pii.service";
import { PortalController } from "./resident/portal.controller";
import { PortalService } from "./resident/portal.service";
import { ResidentWriteRepository } from "./resident/resident-write.repository";
import { ResidentController } from "./resident/resident.controller";
import { ResidentRepository } from "./resident/resident.repository";
import { ResidentService } from "./resident/resident.service";
import { BulkUnitBuilder } from "./unit/unit-bulk.service";
import { UnitController } from "./unit/unit.controller";
import { UnitRepository } from "./unit/unit.repository";
import { UnitService } from "./unit/unit.service";
import { LettersController } from "./letters/letters.controller";
import { LettersService } from "./letters/letters.service";
import { ListsController } from "./lists/lists.controller";
import { ListsService } from "./lists/lists.service";
import { UnitExtrasController, UnitExtrasService } from "./unit/unit-extras.controller";

/**
 * `property` bağlamı — blok, birim, sakin, adres, sayaç (MIMARI-PLAN §6.3).
 * A1'de blok + birim, A3'te sakin; sayaç Track E'de eklenir.
 */
@Module({
  controllers: [ListsController, UnitExtrasController, UnitController, ResidentController, PortalController, LettersController],
  providers: [
    LettersService,
    ListsService,
    UnitExtrasService,
    UnitService,
    UnitRepository,
    BulkUnitBuilder,
    BlockService,
    ResidentService,
    ResidentRepository,
    ResidentWriteRepository,
    PiiService,
    PortalService,
    AccessRequestService,
  ],
  exports: [UnitService, UnitRepository, ResidentService, PiiService],
})
export class PropertyModule {}
