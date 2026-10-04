import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";

import {
  changeReason,
  dataBreachCreate,
  dataBreachUpdate,
  kvkkOwnRequestCreate,
  kvkkRequestCreate,
  kvkkRequestUpdate,
  type DataBreachCreate,
  type DataBreachUpdate,
  type KvkkOwnRequestCreate,
  type KvkkRequestCreate,
  type KvkkRequestUpdate,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { KvkkWriteService } from "./kvkk-write.service";

const kvkkErase = z.object({ responseNote: changeReason });

/**
 * KVKK yazma uçları — `kvkk:manage` (yönetici). Okuma ucu
 * (`GET /v1/panel/kvkk`) `DocumentController`'da; bu dosya yalnız yazıyor.
 */
@ApiTags("panel/kvkk")
@Controller("v1/panel/kvkk")
export class KvkkController {
  constructor(private readonly service: KvkkWriteService) {}

  @Post("requests")
  @RequirePermission("kvkk:manage")
  @ApiOperation({
    summary: "İlgili kişi başvurusunu kaydet (KVKK md.11/13)",
    description:
      "Dilekçe, e-posta ya da KEP ile gelen başvuru. Yasal süre (30 gün) " +
      "`receivedAt`'tan işler; iç hedef `siteConfig.legal.kvkkResponseHours`.",
  })
  createRequest(@Body(new ZodBodyPipe(kvkkRequestCreate)) dto: KvkkRequestCreate) {
    return this.service.createRequest(dto);
  }

  /** Sakin — kendi başvurusu (`kvkk:export_own`). */
  @Get("my-requests")
  @RequirePermission("kvkk:export_own")
  listOwn() {
    return this.service.listOwnRequests();
  }

  @Post("my-requests")
  @RequirePermission("kvkk:export_own")
  @ApiOperation({ summary: "Sakinin kendi KVKK başvurusu (md.11)" })
  createOwn(@Body(new ZodBodyPipe(kvkkOwnRequestCreate)) dto: KvkkOwnRequestCreate) {
    return this.service.createOwnRequest(dto);
  }

  @Patch("requests/:id")
  @RequirePermission("kvkk:manage")
  @ApiOperation({ summary: "Başvuruyu işleme al / sonuçlandır / reddet" })
  updateRequest(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(kvkkRequestUpdate)) dto: KvkkRequestUpdate,
  ) {
    return this.service.updateRequest(id, dto);
  }

  @Post("requests/:id/erase")
  @RequirePermission("kvkk:manage")
  @ApiOperation({
    summary: "Silme talebini uygula (KVKK md.7) — anonimleştirme",
    description:
      "Kimlik ve iletişim verileri anonimleşir; mali kayıtlar ve karar defteri " +
      "yasal saklama gereği kalır. Kişi sitede üyeyse, açık borcu varsa ya da " +
      "başka sitede aktif üyeliği varsa reddedilir.",
  })
  erase(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(kvkkErase)) dto: { responseNote: string },
  ) {
    return this.service.erase(id, dto.responseNote);
  }

  @Get("breaches")
  @RequirePermission("kvkk:read")
  listBreaches() {
    return this.service.listBreaches();
  }

  @Post("breaches")
  @RequirePermission("kvkk:manage")
  @ApiOperation({ summary: "Veri ihlali kaydı (KVKK md.12/5 — Kurul'a 72 saat)" })
  createBreach(@Body(new ZodBodyPipe(dataBreachCreate)) dto: DataBreachCreate) {
    return this.service.createBreach(dto);
  }

  @Patch("breaches/:id")
  @RequirePermission("kvkk:manage")
  updateBreach(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(dataBreachUpdate)) dto: DataBreachUpdate,
  ) {
    return this.service.updateBreach(id, dto);
  }
}
