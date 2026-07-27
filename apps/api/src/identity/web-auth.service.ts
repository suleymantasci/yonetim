import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";

import {
  consumeVerificationToken,
  createSession,
  destroySession,
  generateOtp,
  issueVerificationToken,
  RATE_LIMITS,
  rateLimit,
} from "@yonetim/auth";
import { siteConfig } from "@yonetim/config";
import type {
  WebLoginRequest,
  WebLoginSession,
  WebLoginVerify,
} from "@yonetim/contracts";
import { errors, normalizePhone } from "@yonetim/core";
import { users } from "@yonetim/db";
import { magicLinkEmail, sendEmail } from "@yonetim/emails";
import { sendSms } from "@yonetim/sms";

import { translatorFor } from "../infra/i18n/translator";
import { DbService } from "../infra/db/db.service";

/**
 * Parolasız web girişi — SPEC Bölüm 14.2.
 *
 * NEDEN BURADA: oturumun tek otoritesi `apps/api` (MIMARI-PLAN §8.1). Oturum
 * kaydını render katmanı açsaydı, iptal edilmiş bir oturumu geçerli saymamak
 * için iki ayrı yerin aynı kuralı uygulaması gerekirdi.
 *
 * E-posta → magic link, telefon → SMS OTP. Ayrım kanalın doğasından: bir
 * e-postada bağlantıya tıklamak kod yazmaktan kolay, SMS'te tam tersi.
 */
@Injectable()
export class WebAuthService {
  private readonly logger = new Logger(WebAuthService.name);

  constructor(private readonly db: DbService) {}

  async request(dto: WebLoginRequest): Promise<{
    channel: "email" | "sms";
    identifier: string;
  }> {
    const raw = dto.identifier.trim();
    const isEmail = raw.includes("@");
    const identifier = isEmail ? raw.toLowerCase() : normalizePhone(raw);
    if (!identifier) throw errors.validation("invalid_identifier");

    const limit = await rateLimit(RATE_LIMITS.login, identifier);
    if (!limit.allowed) throw errors.rateLimited();

    const user = await this.db.bypass("auth:lookup", async (tx) => {
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          isEmail ? eq(users.email, identifier) : eq(users.phone, identifier),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    // Kullanıcı yoksa da aynı yanıt dönüyor: "bu numara kayıtlı değil" cevabı,
    // kimin hangi sitede oturduğunu sorgulanabilir hâle getirirdi.
    if (user) {
      if (isEmail) {
        await this.sendMagicLink(identifier, user.id, dto.locale);
      } else {
        await this.sendOtp(identifier, user.id, dto.locale);
      }
    }

    return { channel: isEmail ? "email" : "sms", identifier };
  }

  private async sendMagicLink(
    identifier: string,
    userId: string,
    locale?: string,
  ): Promise<void> {
    const { token } = await issueVerificationToken({
      identifier,
      purpose: "magic_link",
      ttlMinutes: 15,
      metadata: { userId },
    });
    const url = `${siteConfig.env.appUrl}/giris/dogrula?e=${encodeURIComponent(
      identifier,
    )}&t=${token}`;
    const mail = magicLinkEmail(translatorFor("notification", locale), {
      url,
      expiresMinutes: 15,
    });
    await sendEmail({ to: identifier, subject: mail.subject, html: mail.html });
  }

  private async sendOtp(
    identifier: string,
    userId: string,
    locale?: string,
  ): Promise<void> {
    const code = generateOtp(6);
    await issueVerificationToken({
      identifier,
      purpose: "otp",
      ttlMinutes: 5,
      code,
      metadata: { userId },
    });
    await sendSms({
      to: identifier,
      body: translatorFor("app", locale)("login.smsBody", {
        brand: siteConfig.brand.name,
        code,
      }),
      isOtp: true,
    });
  }

  /**
   * Kodu/bağlantıyı oturuma çevirir.
   *
   * Başarısızlık **kod** olarak dönüyor (`invalid`, `used`, `expired`,
   * `wrongPurpose`) — ekran mesajı kullanıcının dilinde orada üretiliyor.
   */
  async verify(dto: WebLoginVerify): Promise<WebLoginSession> {
    const limit = await rateLimit(RATE_LIMITS.otp, dto.identifier);
    if (!limit.allowed) throw errors.rateLimited();

    // Amaç kimlik türünden çıkıyor: e-posta ile gelen bir kod magic link,
    // telefonla gelen OTP. `wrongPurpose` kontrolü `consume` içinde.
    const purpose = dto.identifier.includes("@") ? "magic_link" : "otp";
    const result = await consumeVerificationToken({
      identifier: dto.identifier,
      token: dto.token,
      purpose,
    });

    if (!result.ok) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "token_rejected",
        details: { reason: result.reason },
      });
    }

    const userId = String(
      (result.metadata as { userId?: string }).userId ?? "",
    );
    if (!userId) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "token_rejected",
        details: { reason: "userNotFound" },
      });
    }

    const { token, expiresAt } = await createSession({
      userId,
      rememberMe: true,
    });

    await this.db.bypass("auth:touch-login", async (tx) => {
      await tx
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, userId));
    });

    this.logger.log({ event: "auth.web_login", userId });
    return { sessionToken: token, expiresAt, userId };
  }

  /**
   * Oturumu kapatır.
   *
   * Kayıt burada siliniyor, yalnız çerez düşürülmüyor: çerezi silmek
   * tarayıcının o kopyasını unutturur, çalınmış bir jetonu geçersiz kılmaz.
   * Bilinmeyen jetonda da sessizce başarı dönüyor — çıkış yapmak isteyen
   * kullanıcıya "oturumunuz zaten yoktu" demenin bir karşılığı yok.
   */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await destroySession(token);
  }
}
