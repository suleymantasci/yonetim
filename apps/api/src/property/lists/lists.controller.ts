import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  detailedListQuery,
  householdListQuery,
  occupancyListQuery,
  tcknListQuery,
  vehicleListQuery,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ListsService } from "./lists.service";

/** Üye listeleri — `/v1/panel/lists/*` (`resident:read`; açık TC/telefon `resident:write`). */
@ApiTags("panel/lists")
@Controller("v1/panel/lists")
export class ListsController {
  constructor(private readonly service: ListsService) {}

  @Get("household")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "İkamet edenler (sakinler + hane halkı)" })
  household(@Query() query: Record<string, string>) {
    const q = householdListQuery.parse(query);
    return this.service.household({ ...q, self: q.self === "1" });
  }

  @Get("vehicles")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "Araç plaka listesi" })
  vehicles(@Query() query: Record<string, string>) {
    return this.service.vehicles(vehicleListQuery.parse(query));
  }

  @Get("tckn")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "TC kimlik listesi (maskeli; açık değer yönetici + denetim kaydı)" })
  tckn(@Query() query: Record<string, string>) {
    const q = tcknListQuery.parse(query);
    return this.service.tckn({ ...q, reveal: q.reveal === "1" });
  }

  @Get("occupancy")
  @RequirePermission("unit:read")
  @ApiOperation({ summary: "Boş / dolu bağımsız bölüm listesi" })
  occupancy(@Query() query: Record<string, string>) {
    return this.service.occupancy(occupancyListQuery.parse(query));
  }

  @Get("detailed")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "Seçmeli sütunlu üye dökümü" })
  detailed(@Query() query: Record<string, string>) {
    const q = detailedListQuery.parse(query);
    return this.service.detailed({ ...q, reveal: q.reveal === "1" });
  }
}
