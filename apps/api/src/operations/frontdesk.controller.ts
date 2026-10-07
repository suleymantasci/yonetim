import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import {
  parcelCreate,
  parcelDeliver,
  visitorCreate,
  type ParcelCreate,
  type ParcelDeliver,
  type VisitorCreate,
} from "@yonetim/contracts";

import { RequirePermission } from "../identity/decorators";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { FrontdeskService } from "./frontdesk.service";

/** Kargo ve ziyaretçi defteri — `/v1/panel/frontdesk`. */
@ApiTags("panel/frontdesk")
@Controller("v1/panel/frontdesk")
export class FrontdeskController {
  constructor(private readonly service: FrontdeskService) {}

  @Get()
  @RequirePermission("frontdesk:read")
  @ApiOperation({ summary: "Bekleyen kargolar + içerideki ziyaretçiler (son 30 gün)" })
  overview() {
    return this.service.overview();
  }

  @Post("parcels")
  @RequirePermission("frontdesk:write")
  @ApiOperation({ summary: "Kargo teslim al", description: "Daire verilirse aktif sakinlere uygulama içi bildirim düşer." })
  receiveParcel(@Body(new ZodBodyPipe(parcelCreate)) dto: ParcelCreate) {
    return this.service.receiveParcel(dto);
  }

  @Post("parcels/:id/deliver")
  @RequirePermission("frontdesk:write")
  deliverParcel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(parcelDeliver)) dto: ParcelDeliver,
  ) {
    return this.service.deliverParcel(id, dto);
  }

  @Post("visitors")
  @RequirePermission("frontdesk:write")
  registerVisitor(@Body(new ZodBodyPipe(visitorCreate)) dto: VisitorCreate) {
    return this.service.registerVisitor(dto);
  }

  @Post("visitors/:id/checkout")
  @RequirePermission("frontdesk:write")
  checkoutVisitor(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.checkoutVisitor(id);
  }
}
