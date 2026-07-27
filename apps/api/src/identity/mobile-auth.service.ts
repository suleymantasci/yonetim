import { randomBytes } from "node:crypto";

import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";

import {
  consumeVerificationToken,
  generateOtp,
  issueVerificationToken,
  RATE_LIMITS,
  rateLimit,
} from "@yonetim/auth";
import type { OtpRequest, OtpVerify, TokenPair } from "@yonetim/contracts";
import { normalizePhone, type Role } from "@yonetim/core";
import { memberships, sessions, tenants, users } from "@yonetim/db";
import { sendSms } from "@yonetim/sms";

import { env } from "../infra/config/env";
import { DbService } from "../infra/db/db.service";
import { signJwt, verifyJwt } from "./jwt.util";

/** Access kısa: çalınan token'ın penceresi dar olsun. */
const ACCESS_TTL_SECONDS = 15 * 60;
/** Refresh uzun: sakin uygulamayı ayda bir açsa da tekrar giriş istemesin. */
const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Mobil kimlik doğrulama — MIMARI-PLAN §14 A3, §17 kararı 2.
 *
 * OTURUM KAYDI ORTAK: mobil token'ın `sid` claim'i `sessions` tablosundaki
 * satırı gösteriyor. Ayrı bir "mobil oturum" tablosu açmadık; böylece iptal
 * (çıkış, cihaz kaybı, yönetici müdahalesi) tek yerden çalışıyor ve
 * "oturumlarım" ekranı web ile mobili birlikte gösterebiliyor.
 *
 * ROTASYON: refresh token'ın kendisi saklanmıyor; onun yerine oturum satırı
 * güncel **kuşağı** (`jti`) taşıyor. Her yenileme yeni bir kuşak yazıyor, bu
 * yüzden kullanılmış bir refresh ikinci kez çalışmıyor.
 *
 * Neden önemli: rotasyonsuz tasarımda çalınan bir refresh, kurban aktif
 * olarak kullanmaya devam etse bile aylarca geçerli kalırdı. Kuşak
 * karşılaştırmasıyla iki taraftan biri yenilediği an diğerinin elindeki
 * token ölüyor — hırsızlık en geç bir sonraki yenilemede erişimi kesiyor.
 * Oturum satırı silindiğinde ise (çıkış) tüm türevler birden ölüyor.
 */
@Injectable()
export class MobileAuthService {
  private readonly logger = new Logger(MobileAuthService.name);

  constructor(private readonly db: DbService) {}

  /**
   * OTP gönderir.
   *
   * Kayıtlı olmayan kimlikte de `sent: true` döner. "Bu numara sistemde yok"
   * cevabı, bir apartman yönetim sisteminde kimin nerede oturduğunu
   * sızdırırdı; hız sınırı da aynı sebeple kimlik başına uygulanıyor.
   */
  async requestOtp(
    dto: OtpRequest,
  ): Promise<{ sent: true; retryAfterSeconds: number }> {
    const identifier = this.normalizeIdentifier(dto.identifier);
    const limit = await rateLimit(RATE_LIMITS.otp, identifier);
    if (!limit.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000),
      );
      return { sent: true, retryAfterSeconds: retryAfter };
    }

    const user = await this.findUser(identifier);
    if (user) {
      const code = generateOtp(6);
      await issueVerificationToken({
        identifier,
        purpose: "otp",
        ttlMinutes: 5,
        code,
        metadata: { userId: user.id, channel: "mobile" },
      });
      // Mesaj metni dile bağımlı; paket dilden bağımsız kalsın diye şablon
      // burada değil `packages/sms` içindeki OTP yolunda (SPEC 4.2).
      await sendSms({
        to: identifier,
        body: `Yonetim giris kodunuz: ${code}`,
        isOtp: true,
      }).catch((error: unknown) => {
        // Gönderim hatası kullanıcıya sızdırılmaz (kimlik sayımı yüzeyi);
        // operasyon tarafında görünür olması için loglanır.
        this.logger.error({ event: "mobile.otp_send_failed", error });
      });
    }

    return { sent: true, retryAfterSeconds: RATE_LIMITS.otp.windowSeconds };
  }

  /** Kod → token çifti. Kod tek kullanımlık; `consumeVerificationToken` işaretler. */
  async verifyOtp(
    dto: OtpVerify,
    meta: { ip?: string; userAgent?: string },
  ): Promise<TokenPair> {
    const identifier = this.normalizeIdentifier(dto.identifier);

    const limit = await rateLimit(RATE_LIMITS.otp, `verify:${identifier}`);
    if (!limit.allowed) throw new UnauthorizedException("rate_limited");

    const result = await consumeVerificationToken({
      identifier,
      token: dto.code,
      purpose: "otp",
    });
    if (!result.ok)
      throw new UnauthorizedException(`unauthorized:${result.reason}`);

    const userId = String(
      (result.metadata as { userId?: string }).userId ?? "",
    );
    if (!userId) throw new UnauthorizedException("unauthorized");

    const tenant = await this.resolveTenant(userId, dto.tenantSlug ?? null);

    const generation = newGeneration();
    const sessionId = await this.db.bypass(
      "mobile:create-session",
      async (tx) => {
        const [row] = await tx
          .insert(sessions)
          .values({
            userId,
            activeTenantId: tenant.id,
            // Cookie yolu token'ın hash'ini saklıyor; mobilde saklanan sır
            // token değil **kuşak**: refresh'in geçerliliği imza + bu değerin
            // eşleşmesi. Cookie hash'leriyle karışmasın diye önekli.
            token: `mobile:${generation}`,
            expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
            ip: meta.ip,
            userAgent: meta.userAgent,
            device: dto.device ?? "mobile",
          })
          .returning({ id: sessions.id });
        if (!row) throw new UnauthorizedException("unauthorized");
        return row.id;
      },
    );

    return this.issuePair(userId, tenant, sessionId, generation);
  }

  /**
   * Refresh rotasyonu.
   *
   * Üç ayrı sebeple reddedilir ve üçü de kasıtlı:
   *   - oturum satırı yok        → çıkış yapılmış / iptal edilmiş
   *   - satır süresi geçmiş      → hareketsizlik
   *   - kuşak eşleşmiyor         → bu refresh zaten kullanılmış (rotasyon)
   *
   * Kuşak güncellemesi `WHERE token = <eski kuşak>` ile yapılıyor: iki eşzamanlı
   * yenileme yarışırsa yalnız biri satırı günceller, diğeri 0 satır etkileyip
   * reddedilir. Kontrol edip sonra yazsaydık ikisi de geçerli çift alırdı.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = verifyJwt(refreshToken, env().AUTH_SECRET);
    if (!payload || payload.typ !== "refresh" || !payload.sid || !payload.jti) {
      throw new UnauthorizedException("unauthorized");
    }

    const generation = newGeneration();
    const rotated = await this.db.bypass("mobile:refresh", async (tx) => {
      const rows = await tx
        .update(sessions)
        .set({
          token: `mobile:${generation}`,
          expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        })
        .where(
          and(
            eq(sessions.id, payload.sid!),
            eq(sessions.userId, payload.sub),
            eq(sessions.token, `mobile:${payload.jti!}`),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .returning({ id: sessions.id });
      return rows[0] ?? null;
    });
    if (!rotated) throw new UnauthorizedException("unauthorized");

    // Tenant her yenilemede **yeniden** çözülüyor: üyeliği kaldırılan
    // kullanıcı, elindeki refresh ile erişimini uzatamasın.
    const tenant = await this.resolveTenant(payload.sub, null, payload.tid);
    return this.issuePair(payload.sub, tenant, rotated.id, generation);
  }

  /** Çıkış — oturum satırı silinir, ona bağlı bütün token'lar ölür. */
  async logout(refreshToken: string): Promise<{ ok: true }> {
    const payload = verifyJwt(refreshToken, env().AUTH_SECRET);
    if (payload?.sid) {
      await this.db.bypass("mobile:logout", async (tx) => {
        await tx.delete(sessions).where(eq(sessions.id, payload.sid!));
      });
    }
    // Geçersiz token'da da 200: çıkış istemi her zaman başarılı sayılır,
    // aksi halde uç "bu token geçerli miydi" sorusunu cevaplardı.
    return { ok: true };
  }

  /* ---------------------------------------------------------------- *
   * Yardımcılar
   * ---------------------------------------------------------------- */

  private issuePair(
    userId: string,
    tenant: { id: string; slug: string; roles: Role[] },
    sessionId: string,
    generation: string,
  ): TokenPair {
    const secret = env().AUTH_SECRET;
    return {
      // Access token kuşak taşımıyor: her istekte oturum satırını okumak,
      // JWT'yi kullanmanın anlamını ortadan kaldırırdı. Kısa ömrü (15 dk)
      // iptal penceresini zaten dar tutuyor.
      accessToken: signJwt(
        { sub: userId, tid: tenant.id, typ: "access", sid: sessionId },
        secret,
        ACCESS_TTL_SECONDS,
      ),
      refreshToken: signJwt(
        {
          sub: userId,
          tid: tenant.id,
          typ: "refresh",
          sid: sessionId,
          jti: generation,
        },
        secret,
        REFRESH_TTL_SECONDS,
      ),
      expiresIn: ACCESS_TTL_SECONDS,
      tokenType: "Bearer",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      userId,
      roles: tenant.roles,
    };
  }

  private normalizeIdentifier(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes("@")) return trimmed.toLowerCase();
    return normalizePhone(trimmed) ?? trimmed;
  }

  private async findUser(identifier: string): Promise<{ id: string } | null> {
    const isEmail = identifier.includes("@");
    return this.db.bypass("mobile:lookup", async (tx) => {
      const rows = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            isNull(users.deletedAt),
            isEmail ? eq(users.email, identifier) : eq(users.phone, identifier),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Kullanıcının hangi sitede çalışacağını belirler.
   *
   * Birden fazla üyelik varsa ve slug verilmemişse `tenant_selection_required`
   * ile 409 döner: rastgele birini seçmek, kullanıcıyı yanlış sitenin
   * verisiyle karşılamak demekti.
   */
  private async resolveTenant(
    userId: string,
    slug: string | null,
    preferredTenantId?: string,
  ): Promise<{ id: string; slug: string; roles: Role[] }> {
    const rows = await this.db.bypass("mobile:tenants", async (tx) =>
      tx
        .select({
          tenantId: memberships.tenantId,
          role: memberships.role,
          slug: tenants.slug,
          name: tenants.name,
        })
        .from(memberships)
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(
          and(
            eq(memberships.userId, userId),
            isNull(memberships.deletedAt),
            isNull(tenants.deletedAt),
          ),
        ),
    );
    if (rows.length === 0) throw new UnauthorizedException("unauthorized");

    const byTenant = new Map<
      string,
      { slug: string; name: string; roles: Role[] }
    >();
    for (const row of rows) {
      const entry = byTenant.get(row.tenantId) ?? {
        slug: row.slug,
        name: row.name,
        roles: [] as Role[],
      };
      entry.roles.push(row.role as Role);
      byTenant.set(row.tenantId, entry);
    }

    const wanted = slug
      ? [...byTenant.entries()].find(([, value]) => value.slug === slug)
      : preferredTenantId
        ? [...byTenant.entries()].find(([id]) => id === preferredTenantId)
        : byTenant.size === 1
          ? [...byTenant.entries()][0]
          : undefined;

    if (!wanted) {
      if (slug || preferredTenantId)
        throw new UnauthorizedException("unauthorized");
      throw new ConflictException({
        code: "conflict",
        message: "tenant_selection_required",
        details: {
          tenants: [...byTenant.entries()].map(([id, value]) => ({
            id,
            slug: value.slug,
            name: value.name,
            roles: value.roles,
          })),
        },
      });
    }

    const [id, value] = wanted;
    return { id, slug: value.slug, roles: value.roles };
  }
}

/**
 * Yeni refresh kuşağı. `sessions.token` tekil olduğu için tahmin edilemez ve
 * çakışmayan olmalı; 128 bit rastgelelik ikisini de karşılıyor.
 */
function newGeneration(): string {
  return randomBytes(16).toString("hex");
}
