import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import {
  burnPasswordTime,
  consumeVerificationToken,
  createSession,
  destroySession,
  generateOtp,
  issueVerificationToken,
  RATE_LIMITS,
  rateLimit,
  resolveSession,
  switchTenant,
  verifyPassword,
} from "@yonetim/auth";
import { siteConfig } from "@yonetim/config";
import type {
  WebLoginOtpVerify,
  WebLoginRequest,
  WebLoginSession,
  WebLoginVerify,
  WebPasswordLogin,
  WebPasswordLoginResult,
} from "@yonetim/contracts";
import { errors, normalizePhone } from "@yonetim/core";
import { memberships, users } from "@yonetim/db";
import { loginCodeEmail, magicLinkEmail, sendEmail } from "@yonetim/emails";
import { sendSms } from "@yonetim/sms";

import { env } from "../infra/config/env";
import { translatorFor } from "../infra/i18n/translator";
import { DbService } from "../infra/db/db.service";

/**
 * Web girişi — SPEC Bölüm 14.2.
 *
 * NEDEN BURADA: oturumun tek otoritesi `apps/api` (MIMARI-PLAN §8.1). Oturum
 * kaydını render katmanı açsaydı, iptal edilmiş bir oturumu geçerli saymamak
 * için iki ayrı yerin aynı kuralı uygulaması gerekirdi.
 *
 * İKİ YOL VAR ve ikisi de aynı `openSession`'da bitiyor:
 *
 *  1. **Parola** (`loginWithPassword`) — normal giriş. `AUTH_OTP_ENABLED`
 *     açıksa parolanın ardından tek kullanımlık kod da isteniyor
 *     (`verifyLoginOtp`), kapalıysa oturum hemen açılıyor.
 *  2. **Parolasız** (`request` + `verify`) — kayıt doğrulaması ve "parolamı
 *     bilmiyorum" kurtarması. E-posta → magic link, telefon → SMS OTP; ayrım
 *     kanalın doğasından: e-postada bağlantıya tıklamak kod yazmaktan kolay,
 *     SMS'te tam tersi.
 *
 * İkinci yol kaldırılmadı çünkü ilk parolayı belirlemenin ve unutulan parolayı
 * kurtarmanın başka yolu yok — kaldırmak, parolasını unutan kullanıcıyı
 * hesabından kalıcı olarak kilitlemek olurdu. Karşılığında şunu kabul ediyoruz:
 * e-posta kutusuna (ya da hattına) erişen biri parolayı bilmeden de girebilir.
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

  /* ------------------------------------------------------------ *
   * Parolalı giriş
   * ------------------------------------------------------------ */

  /**
   * Birinci adım: parola.
   *
   * İkinci adımın olup olmayacağına **sunucu** karar veriyor
   * (`AUTH_OTP_ENABLED`). Bayrağı panele de okutmak, oturumun açılıp
   * açılmayacağını iki ayrı sürecin aynı ayarı doğru okumasına bağlardı;
   * burada panel yalnızca "sırada ne var" bilgisini alıyor.
   *
   * KULLANICI SAYIMI (enumeration): kayıtsız kimlik, parolası olmayan hesap ve
   * yanlış parola **aynı** hatayı veriyor. Üçü ayrılsaydı uç, "bu e-posta
   * kayıtlı mı" sorusunun sorulabildiği bir yüzey olurdu. Aynı gerekçeyle
   * kullanıcı bulunamadığında da `burnPasswordTime` çağrılıyor: fark yanıt
   * metninden çıkarılamıyorsa yanıt **süresinden** çıkarılırdı.
   */
  async loginWithPassword(
    dto: WebPasswordLogin,
  ): Promise<WebPasswordLoginResult> {
    const raw = dto.identifier.trim();
    const isEmail = raw.includes("@");
    const identifier = isEmail ? raw.toLowerCase() : normalizePhone(raw);
    if (!identifier) throw errors.validation("invalid_identifier");

    const limit = await rateLimit(RATE_LIMITS.login, identifier);
    if (!limit.allowed) throw errors.rateLimited();

    const user = await this.db.bypass("auth:password-lookup", async (tx) => {
      const rows = await tx
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(
          and(
            isEmail ? eq(users.email, identifier) : eq(users.phone, identifier),
            // Silinmiş hesap parolasıyla giremiyor. `resolveSession` zaten
            // `deletedAt` bakıyor, yani oturum açılsa bile ilk istekte
            // düşerdi — ama o "girdim sanıp her yerde 401 alan" bir kullanıcı
            // demek; ret girişin kendisinde olmalı.
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    const ok = user?.passwordHash
      ? await verifyPassword(dto.password, user.passwordHash)
      : await burnPasswordTime(dto.password);

    if (!ok || !user) {
      this.logger.warn({ event: "auth.password_login_failed", identifier });
      throw errors.unauthorized("invalid_credentials");
    }

    if (!env().AUTH_OTP_ENABLED) {
      const session = await this.openSession(user.id);
      return { status: "session", identifier, channel: null, session };
    }

    const channel = isEmail ? "email" : "sms";
    await this.sendLoginOtp(identifier, user.id, channel, dto.locale);

    this.logger.log({ event: "auth.password_ok_otp_sent", userId: user.id });
    return { status: "otp_required", identifier, channel, session: null };
  }

  /**
   * İkinci adım: parolanın ardından gelen kod.
   *
   * Kodun amacı `login_otp` — parolasız akışın `otp`'sinden ayrı. Aynı havuzu
   * paylaşsalardı `POST /v1/auth/web/request` ile parola bilmeden alınan bir
   * kod bu adımı geçerdi; ikinci faktör, birinci faktörü atlamanın yolu
   * olurdu.
   */
  async verifyLoginOtp(dto: WebLoginOtpVerify): Promise<WebLoginSession> {
    const identifier = dto.identifier.includes("@")
      ? dto.identifier.trim().toLowerCase()
      : normalizePhone(dto.identifier);
    if (!identifier) throw errors.validation("invalid_identifier");

    // Gönderim değil **deneme** sınırı: yanlış yazılan kod da sayılıyor ama
    // kova daha cömert — iki tuş hatası kullanıcıyı bir saat kilitlememeli.
    const limit = await rateLimit(RATE_LIMITS.otpVerify, identifier);
    if (!limit.allowed) throw errors.rateLimited();

    const result = await consumeVerificationToken({
      identifier,
      token: dto.code,
      purpose: "login_otp",
    });

    if (!result.ok) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "token_rejected",
        details: { reason: result.reason },
      });
    }

    const userId = String((result.metadata as { userId?: string }).userId ?? "");
    if (!userId) {
      throw new BadRequestException({
        code: "validation_failed",
        message: "token_rejected",
        details: { reason: "userNotFound" },
      });
    }

    return this.openSession(userId);
  }

  /**
   * İkinci adım kodunu gönderir.
   *
   * Kanal, kullanıcının **giriş yaparken kullandığı** kimlikten seçiliyor:
   * telefonla giren SMS, e-postayla giren posta alıyor. Sunucunun "telefonu da
   * var, oraya göndereyim" demesi, kullanıcının beklemediği bir kanala
   * gönderim demekti.
   *
   * Gönderim hatası girişi **düşürüyor**: kod gitmediği hâlde `otp_required`
   * dönmek, kullanıcıyı hiç gelmeyecek bir kodu bekleten bir ekranda
   * bırakırdı.
   */
  private async sendLoginOtp(
    identifier: string,
    userId: string,
    channel: "email" | "sms",
    locale?: string,
  ): Promise<void> {
    const code = generateOtp(6);
    await issueVerificationToken({
      identifier,
      purpose: "login_otp",
      ttlMinutes: 5,
      code,
      // Kodu **kime** verdiğimizi bağlıyor; doğrulama oturumu bu alandan açıyor.
      metadata: { userId },
    });

    if (channel === "sms") {
      const sent = await sendSms({
        to: identifier,
        body: translatorFor("app", locale)("login.smsBody", {
          brand: siteConfig.brand.name,
          code,
        }),
        isOtp: true,
      });
      if (!sent.ok) {
        this.logger.error({ event: "auth.login_otp_sms_failed", userId });
        throw errors.integrationUnavailable("SMS");
      }
      return;
    }

    const mail = loginCodeEmail(translatorFor("notification", locale), {
      code,
      expiresMinutes: 5,
    });
    const sent = await sendEmail({
      to: identifier,
      subject: mail.subject,
      html: mail.html,
    });
    if (!sent.ok) {
      this.logger.error({ event: "auth.login_otp_email_failed", userId });
      throw errors.integrationUnavailable("E-posta");
    }
  }

  /** Oturumu açar ve son giriş zamanını yazar — iki giriş yolunun ortak sonu. */
  private async openSession(userId: string): Promise<WebLoginSession> {
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

    return this.openSession(userId);
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

  /**
   * Aktif siteyi değiştirir — yönetim şirketi konsolu (SPEC Bölüm 2.2).
   *
   * ÜYELİK **BURADA** DOĞRULANIYOR: `switchTenant` oturum satırını körlemesine
   * güncelliyor, yani doğrulama atlanırsa kullanıcı hiç üyesi olmadığı bir
   * siteyi aktif yapabilirdi. Bağlam çözücü sonradan üyelik arayıp reddederdi
   * ama o noktada kullanıcı kilitli bir oturumda kalırdı — kontrol geçişin
   * kendisinde olmalı.
   *
   * Oturum önbelleği çağıran uçta düşürülüyor; aksi halde yeni site en fazla
   * `SESSION_CACHE_TTL` kadar gecikmeyle görünürdü.
   */
  async switchTenant(token: string | undefined, tenantId: string): Promise<void> {
    if (!token) throw errors.unauthorized("session_required");

    const session = await resolveSession(token);
    if (!session) throw errors.unauthorized("session_required");

    const member = await this.db.platform(async (tx) =>
      tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, session.user.id),
            eq(memberships.tenantId, tenantId),
          ),
        )
        .limit(1),
    );
    if (!member[0]) throw errors.forbidden("not_a_member");

    await switchTenant(token, tenantId);
  }
}
