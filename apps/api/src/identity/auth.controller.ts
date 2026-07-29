import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import {
  logoutRequest,
  otpRequest,
  otpVerify,
  refreshRequest,
  tenantSwitch,
  webLoginRequest,
  webLoginVerify,
  type AuthMe,
  type TenantSwitch,
  type WebLoginRequest,
  type WebLoginVerify,
  type OtpRequest,
  type OtpVerify,
} from "@yonetim/contracts";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";

import { DbService } from "../infra/db/db.service";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { AppContextService } from "./app-context.service";
import { ContextResolver } from "./context-resolver.service";
import { WebAuthService } from "./web-auth.service";
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
    private readonly appContext: AppContextService,
    private readonly web: WebAuthService,
    private readonly contextResolver: ContextResolver,
  ) {}

  /* ---------------------------------------------------------------- *
   * Web (parolasız) — magic link + SMS OTP
   * ---------------------------------------------------------------- */

  @Public()
  @Post("web/request")
  @ApiOperation({
    summary: "Web girişi — kod/bağlantı gönder",
    description:
      "Kayıtlı olmayan kimlikte de aynı yanıt döner: aksi halde uç, kimin " +
      "sistemde olduğunu sorgulanabilir hale getirirdi.",
  })
  webRequest(
    @Body(new ZodBodyPipe(webLoginRequest)) dto: WebLoginRequest,
  ) {
    return this.web.request(dto);
  }

  @Public()
  @Post("web/verify")
  @ApiOperation({
    summary: "Web girişi — kodu oturuma çevir",
    description:
      "Oturum **jetonu** döner, çerez değil: çerezi tarayıcıya `apps/app` " +
      "yazar (tarayıcı yalnız onun origin'ini görür), ama oturumun var olma " +
      "kararı burada verilir ve iptali burada etkili olur.",
  })
  webVerify(@Body(new ZodBodyPipe(webLoginVerify)) dto: WebLoginVerify) {
    return this.web.verify(dto);
  }

  @Public()
  @Post("web/logout")
  @HttpCode(204)
  @ApiOperation({
    summary: "Web oturumunu kapat",
    description:
      "Oturum kaydı silinir **ve** oturum önbelleği düşürülür. Yalnız çerezi " +
      "düşürmek, çalınmış bir jetonu geçersiz kılmazdı; yalnız kaydı silmek de " +
      "yetmiyordu — önbellek jetonu TTL süresi kadar geçerli tutuyordu.",
  })
  async webLogout(@Req() req: Request): Promise<void> {
    const token = readSessionCookie(req.headers.cookie);
    await this.web.logout(token);
    /*
     * ÖNBELLEK DÜŞÜRME BURADA EKSİKTİ ve bu bir güvenlik açığıydı.
     *
     * `ContextResolver` oturumu çözdükten sonra kimliği Redis'te
     * `SESSION_CACHE_TTL` (60 sn) boyunca tutuyor ve sonraki isteklerde
     * veritabanına hiç bakmıyor. Yani `destroySession` satırı sildiği hâlde
     * jeton bir dakika daha çalışıyordu: "çıkış yaptım" diyen kullanıcının
     * jetonu, tam da onu ele geçirmiş birinin elinde hâlâ geçerliydi.
     *
     * `switch-tenant` bu düşürmeyi zaten yapıyordu — orada gerekçe yetkinin
     * gecikmesiydi. Çıkışta gerekçe daha ağır ve atlanmıştı. Hata,
     * impersonation çıkışının doğrulanması sırasında ortaya çıktı: silinen
     * oturum hâlâ 200 dönüyordu.
     */
    if (token) await this.contextResolver.invalidateSession(token);
  }

  @Post("web/switch-tenant")
  @HttpCode(204)
  @ApiOperation({
    summary: "Aktif siteyi değiştir — yönetim şirketi konsolu",
    description:
      "Üyelik doğrulanır; üyesi olunmayan bir site 403 döner. Oturum " +
      "önbelleği hemen düşürülür, yoksa yeni site en fazla önbellek TTL'i " +
      "kadar gecikmeyle görünürdü.",
  })
  async switchTenant(
    @Req() req: Request,
    @Body(new ZodBodyPipe(tenantSwitch)) dto: TenantSwitch,
  ): Promise<void> {
    const token = readSessionCookie(req.headers.cookie);
    await this.web.switchTenant(token, dto.tenantId);
    if (token) await this.contextResolver.invalidateSession(token);
  }

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

  /**
   * Kabuk bağlamı — site adı/durumu ve erişilebilir diğer siteler.
   *
   * `me`'den ayrı: o uç kimlik yollarının aynılığını sınayan testin
   * sözleşmesi ve sabit kalmalı. Ekranın istediği alanları oraya eklemek,
   * bir başlık değişikliğini kimlik testini kıran bir değişiklik yapardı.
   */
  @Get("context")
  context() {
    return this.appContext.resolve();
  }
}

/**
 * Çerez başlığından oturum jetonunu okur.
 *
 * `@Public()` olduğu için guard bağlam çözmüyor; jetona doğrudan erişmek
 * gerekiyor. Ayrıştırma basit tutuldu: tek bir ada bakılıyor.
 */
function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const prefix = `${SESSION_COOKIE}=`;
  const part = header
    .split(";")
    .map((piece) => piece.trim())
    .find((piece) => piece.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : undefined;
}

function headerValue(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}
