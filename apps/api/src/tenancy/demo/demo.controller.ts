import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Get, Req } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import {
  demoRequestCreate,
  demoTokenBody,
  platformDemoPurge,
  type DemoRequestCreate,
  type DemoRequestCreateResult,
  type DemoStatusResult,
  type DemoTokenBody,
  type PlatformDemoList,
  type PlatformDemoPurge,
  type PlatformDemoPurgeResult,
} from "@yonetim/contracts";
import { errors } from "@yonetim/core";

import { Public } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { DemoService } from "./demo.service";

/**
 * Demo hesabı — herkese açık uçlar (`/v1/demo-requests`).
 *
 * Token her zaman **gövdede**: URL'ye konsaydı erişim kayıtlarına ve
 * Referer başlığına düşerdi.
 */
@ApiTags("demo")
@Controller("v1/demo-requests")
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Public()
  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Demo hesap talebi — onay bağlantısı e-postayla gider" })
  create(
    @Body(new ZodBodyPipe(demoRequestCreate)) dto: DemoRequestCreate,
    @Req() req: Request,
  ): Promise<DemoRequestCreateResult> {
    return this.demo.create(dto, { ip: clientIp(req), userAgent: header(req, "user-agent") });
  }

  @Public()
  @Post("confirm")
  @HttpCode(200)
  @ApiOperation({ summary: "Onay bağlantısı — demo sitenin kurulumunu başlatır" })
  confirm(@Body(new ZodBodyPipe(demoTokenBody)) dto: DemoTokenBody): Promise<DemoStatusResult> {
    return this.demo.confirm(dto.token);
  }

  @Public()
  @Post("status")
  @HttpCode(200)
  @ApiOperation({ summary: "Demo kurulum durumu (onay bağlantısının sahibine)" })
  status(@Body(new ZodBodyPipe(demoTokenBody)) dto: DemoTokenBody): Promise<DemoStatusResult> {
    return this.demo.status(dto.token);
  }
}

/**
 * Platform — demo talepleri listesi ve elle silme.
 *
 * YALNIZ `super_admin`. Diğer platform rolleri (destek) bu ekranı göremez:
 * buradaki tek yazma işlemi fiziksel veri silme.
 */
@Controller("v1/panel/platform/demo-requests")
export class DemoPlatformController {
  constructor(
    private readonly db: DbService,
    private readonly demo: DemoService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  list(): Promise<PlatformDemoList> {
    this.assertSuperAdmin();
    return this.demo.list();
  }

  @Post(":id/purge")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  purge(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBodyPipe(platformDemoPurge)) dto: PlatformDemoPurge,
  ): Promise<PlatformDemoPurgeResult> {
    const actor = this.assertSuperAdmin();
    return this.demo.purgeNow(id, dto.confirmCode, actor);
  }

  private assertSuperAdmin(): string {
    const ctx = this.db.ctx();
    // Hesaba geçiş (impersonation) sırasında rol, geçilen kullanıcının rolü
    // olur; o oturumdan demo silinemez.
    if (!ctx.userId || ctx.impersonatedBy || !ctx.roles.includes("super_admin")) {
      throw errors.forbidden("Bu işlem yalnız süper yöneticiye açık.");
    }
    return ctx.userId;
  }
}

function header(req: Request, name: string): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

/**
 * İstemci IP'si — sahtelenemeyen kaynaktan.
 *
 * İstek Traefik üzerinden dışarıdan geliyorsa `X-Forwarded-For` başlığını
 * Traefik kendisi yazıyor (güvenilmeyen kaynaktan gelen başlığı siliyor) ve
 * `trust proxy` ile `req.ip` gerçek istemciyi gösteriyor. Bu durumda
 * istemcinin gönderdiği `x-client-ip` YOK SAYILIR — aksi hâlde her istekte
 * farklı bir IP yazarak günlük sınır atlatılırdı.
 *
 * İstek panel sunucusundan iç ağ üzerinden geliyorsa (`X-Forwarded-For`
 * yok) panel, kendi gördüğü istemci IP'sini `x-client-ip` ile iletiyor.
 */
export function clientIp(req: Request): string | null {
  const forwarded = header(req, "x-forwarded-for");
  const ip = forwarded ? req.ip : (header(req, "x-client-ip") ?? req.ip);
  return ip ? ip.replace(/^::ffff:/, "").slice(0, 45) : null;
}
