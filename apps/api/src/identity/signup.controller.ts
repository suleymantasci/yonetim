import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import {
  accessRequestCreate,
  sessionProbe,
  setupTenant,
  signupStart,
  type AccessRequestCreate,
  type SessionProbe,
  type SetupTenant,
  type SetupTenantResult,
  type SignupStart,
  type SignupStartResult,
} from "@yonetim/contracts";
import { resolveSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import { errors } from "@yonetim/core";

import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { Public } from "./decorators";
import { SignupService } from "./signup.service";

/**
 * Kayıt uçları — `/kayit`, `/kayit-talebi`, `/kurulum`.
 *
 * Üçü de `@Public()`. İlk ikisi için sebep açık: kayıt olan kişinin tanımı
 * gereği oturumu yok. `/setup` içinse sebep daha ince — bağlam çözücü hiçbir
 * üyeliği olmayan kullanıcı için kimlik üretmiyor, dolayısıyla korumalı bir
 * uç tam da kurulum yapması gereken kişiyi 401 ile keserdi. Orada kapı
 * kalkmıyor, çerezden oturum çözülerek metoda taşınıyor.
 */
@ApiTags("auth")
@Controller("v1/auth")
export class SignupController {
  constructor(private readonly signup: SignupService) {}

  @Public()
  @Post("signup")
  @ApiOperation({
    summary: "Site/yönetim firması kaydı — deneme sürümü başlatır",
    description:
      "Site ve üyelik oluşur ama **oturum açılmaz**: kullanıcı ancak " +
      "e-posta/telefonunu doğrulayınca girer. Doğrulama giriş akışının aynı " +
      "ucundan (`POST /v1/auth/web/verify`) geçer.",
  })
  start(
    @Body(new ZodBodyPipe(signupStart)) dto: SignupStart,
    @Req() req: Request,
  ): Promise<SignupStartResult> {
    return this.signup.start(dto, headerValue(req, "accept-language")?.slice(0, 2));
  }

  @Public()
  @Post("access-request")
  @ApiOperation({
    summary: "Sakin erişim talebi — yöneticinin onay kuyruğuna düşer",
    description:
      "Yanıt her koşulda aynı (`received: true`). Site bulunamasa da, aynı " +
      "talep zaten beklese de fark etmez — aksi halde uç 'bu sitede bu " +
      "numara kayıtlı mı' sorusunun sorulabildiği bir yüzey olurdu.",
  })
  accessRequest(
    @Body(new ZodBodyPipe(accessRequestCreate)) dto: AccessRequestCreate,
    @Req() req: Request,
  ) {
    return this.signup.createAccessRequest(
      dto,
      headerValue(req, "x-client-ip") ?? req.ip,
    );
  }

  /**
   * İlk site kurulumu.
   *
   * `@Public()` OLMAK ZORUNDA ve bu bir güvenlik gevşetmesi değil: bağlam
   * çözücü, hiçbir üyeliği olmayan kullanıcı için `null` döndürüyor
   * (`resolveTenantForUser` → tenant yok → kimlik yok). Yani korumalı bir uç
   * olsaydı guard bu kullanıcıyı 401 ile keserdi ve tam da kurulum yapması
   * gereken kişi kurulum yapamazdı.
   *
   * Kapı kalkmıyor, yer değiştiriyor: oturum çerezden **burada** çözülüyor ve
   * geçersizse 401 dönüyor. Aynı desen `web/logout`'ta da var.
   */
  @Public()
  @Post("setup")
  @ApiOperation({
    summary: "İlk site kurulumu — hesabı olup sitesi olmayan kullanıcı için",
  })
  async setup(
    @Body(new ZodBodyPipe(setupTenant)) dto: SetupTenant,
    @Req() req: Request,
  ): Promise<SetupTenantResult> {
    const session = await resolveSession(readSessionCookie(req.headers.cookie));
    if (!session) throw errors.unauthorized("session_required");

    return this.signup.setup(
      session.user.id,
      dto,
      headerValue(req, "accept-language")?.slice(0, 2),
    );
  }

  /**
   * Oturum çerezinin geçerli olup olmadığı, üyelikten bağımsız.
   *
   * `TenantContextGuard`'ın `fromSessionCookie` çözücüsü üyeliksiz kullanıcı
   * için `null` dönüyor; `auth/context` ve `auth/me` aynı yüzden iki farklı
   * durumu (stale çerez / geçerli ama üyeliksiz) aynı 401'e eşitliyor. Bu uç
   * yalnız oturum kimliğini çözüyor ve üyelik beklmediği için iki durumu
   * ayırabiliyor.
   *
   * Yalnız çerez → oturum yolu: API anahtarı / mobil JWT bu uçtan geçmez
   * (ikisi de panel/sakin yüzeyi için, kurulum akışının orada işi yok).
   * Dolayısıyla mobil ve API anahtarı istemcileri 401 alır — beklenen.
   */
  @Public()
  @Get("session-probe")
  @ApiOperation({
    summary: "Oturum çerezi geçerli mi?",
    description:
      "Tenant bağlamı çözmeden yalnız çerezden oturumu doğrular. " +
      "Yanıt 200 ise oturum canlı; 401 ise çerez yok ya da süresi dolmuş.",
  })
  async probe(@Req() req: Request): Promise<SessionProbe> {
    const session = await resolveSession(readSessionCookie(req.headers.cookie));
    if (!session) throw errors.unauthorized("session_required");
    return sessionProbe.parse({ authenticated: true, userId: session.user.id });
  }
}

/** Çerez başlığından oturum jetonunu okur (`auth.controller.ts` ile aynı). */
function readSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const prefix = `${SESSION_COOKIE}=`;
  const part = header
    .split(";")
    .map((piece) => piece.trim())
    .find((piece) => piece.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : undefined;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}
