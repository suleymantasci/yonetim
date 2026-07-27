import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import {
  logoutRequest,
  otpRequest,
  otpVerify,
  refreshRequest,
  type AuthMe,
  type OtpRequest,
  type OtpVerify,
} from "@yonetim/contracts";

import { DbService } from "../infra/db/db.service";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { Public } from "./decorators";
import { MobileAuthService } from "./mobile-auth.service";

/**
 * Kimlik uçları — MIMARI-PLAN §14 A3.
 *
 * OTP uçları `@Public()`: kimlik doğrulamanın kendisi kimlik isteyemez.
 * Koruma buradaki tek istisna değil, **tanımlı** istisna: guard zinciri
 * varsayılan olarak kapalı, açılan her uç bu dekoratörle görünür oluyor.
 */
@ApiTags("auth")
@Controller("v1/auth")
export class AuthController {
  constructor(
    private readonly mobile: MobileAuthService,
    private readonly db: DbService,
  ) {}

  @Public()
  @Post("mobile/otp")
  @ApiOperation({
    summary: "Mobil giriş — kod gönder",
    description:
      "Kayıtlı olmayan kimlikte de `sent: true` döner: aksi halde uç, kimin " +
      "sistemde kayıtlı olduğunu sorgulanabilir hale getirirdi.",
  })
  requestOtp(@Body(new ZodBodyPipe(otpRequest)) dto: OtpRequest) {
    return this.mobile.requestOtp(dto);
  }

  @Public()
  @Post("mobile/token")
  @ApiOperation({
    summary: "Mobil giriş — kodu token çiftine çevir",
    description:
      "Kullanıcının birden fazla site üyeliği varsa ve `tenantSlug` " +
      "verilmemişse 409 döner; `details.tenants` seçenekleri taşır.",
  })
  verifyOtp(
    @Body(new ZodBodyPipe(otpVerify)) dto: OtpVerify,
    @Req() req: Request,
  ) {
    return this.mobile.verifyOtp(dto, {
      ip: headerValue(req, "x-client-ip") ?? req.ip,
      userAgent: headerValue(req, "user-agent") ?? undefined,
    });
  }

  @Public()
  @Post("mobile/refresh")
  @ApiOperation({
    summary: "Token yenileme (rotasyon)",
    description:
      "Her çağrı yeni bir çift üretir ve tenant üyeliğini **yeniden** çözer: " +
      "üyeliği kaldırılan kullanıcı elindeki refresh ile erişimini uzatamaz.",
  })
  refresh(
    @Body(new ZodBodyPipe(refreshRequest)) dto: { refreshToken: string },
  ) {
    return this.mobile.refresh(dto.refreshToken);
  }

  @Public()
  @Post("mobile/logout")
  logout(@Body(new ZodBodyPipe(logoutRequest)) dto: { refreshToken: string }) {
    return this.mobile.logout(dto.refreshToken);
  }

  /**
   * Çözülmüş bağlam.
   *
   * A3'ün çıkış ölçütü "dört kimlik yolu da aynı `RequestContext`'i üretiyor";
   * bunu sınayan e2e test bu ucu dört farklı kimlikle çağırıp yalnız `source`
   * alanının farklı olduğunu doğruluyor.
   */
  @Get("me")
  me(): AuthMe {
    const ctx = this.db.ctx();
    return {
      userId: ctx.userId ?? null,
      tenantId: ctx.tenantId,
      tenantSlug: ctx.tenantSlug,
      roles: ctx.roles,
      scopes: ctx.scopes,
      locale: ctx.locale,
      source: ctx.source,
      impersonatedBy: ctx.impersonatedBy ?? null,
    };
  }
}

function headerValue(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
