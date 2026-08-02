import { and, eq, gt, isNull } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import { addDays, addHours, errors, type Role, type TenantContext } from "@yonetim/core";
import { randomToken } from "@yonetim/core/crypto";
import { getDb, memberships, sessions, users, verificationTokens, withBypassRls } from "@yonetim/db";

import { SESSION_COOKIE, SESSION_IDLE_MINUTES, SESSION_MAX_DAYS } from "./cookie";
import { hashToken } from "./otp";

/**
 * Oturum yönetimi — SPEC Bölüm 14.2.
 * Cookie: HttpOnly + Secure + SameSite=Lax, 30 dk idle, 30 gün mutlak süre.
 *
 * L-3: Idle timeout in-memory cache ile uygulanıyor. Multi-replica
 * kurulumda her replica kendi cache'ini tutar; aynı kullanıcı farklı
 * replica'ya düştüğünde sıfırdan başlar. Tam distributed çözüm için
 * `lastSeenAt` kolonu + update query gerekir (migration). Bu güncelleme
 * Phase 4'ün kapsamını aşıyor; defense-in-depth katmanı olarak yeterli.
 */
const idleLastSeen = new Map<string, number>();
const IDLE_WINDOW_MS = SESSION_IDLE_MINUTES * 60 * 1000;

export { SESSION_COOKIE, SESSION_IDLE_MINUTES, SESSION_MAX_DAYS };

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  platformRole: Role | null;
  locale: string;
  twoFactorEnabled: boolean;
}

export interface ActiveSession {
  token: string;
  user: SessionUser;
  activeTenantId: string | null;
  roles: Role[];
  impersonatedBy: string | null;
  expiresAt: Date;
}

export async function createSession(params: {
  userId: string;
  tenantId?: string | null;
  ip?: string;
  userAgent?: string;
  device?: string;
  impersonatedBy?: string;
  rememberMe?: boolean;
  /**
   * Özel ömür (dakika) — `rememberMe`'yi ve 12 saatlik varsayılanı ezer.
   *
   * Impersonation için var: süper-admin bir müşteri hesabına geçtiğinde o
   * oturumun 12 saat yaşaması, kapatmayı unutulan bir tarayıcı sekmesinin
   * müşteri verisine yarım gün açık kalması demekti. Süre sınırını çağıran
   * tarafın vermesi, oturum modülünün "bu oturum ne işe yarıyor" bilgisini
   * taşımasından iyi.
   */
  expiresInMinutes?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = params.expiresInMinutes
    ? new Date(Date.now() + params.expiresInMinutes * 60_000)
    : params.rememberMe
      ? addDays(new Date(), SESSION_MAX_DAYS)
      : addHours(new Date(), 12);

  await withBypassRls("auth:create-session", async (tx) => {
    await tx.insert(sessions).values({
      userId: params.userId,
      activeTenantId: params.tenantId ?? null,
      token: hashToken(token),
      expiresAt,
      ip: params.ip,
      userAgent: params.userAgent,
      device: params.device,
      impersonatedBy: params.impersonatedBy,
    });
  });

  return { token, expiresAt };
}

export async function resolveSession(rawToken: string | undefined): Promise<ActiveSession | null> {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  // L-3: Idle timeout — son görülme üzerinden SESSION_IDLE_MINUTES.
  const last = idleLastSeen.get(tokenHash);
  if (last && Date.now() - last > IDLE_WINDOW_MS) {
    idleLastSeen.delete(tokenHash);
    return null;
  }
  idleLastSeen.set(tokenHash, Date.now());

  return withBypassRls("auth:resolve-session", async (tx) => {
    const rows = await tx
      .select({
        sessionToken: sessions.token,
        activeTenantId: sessions.activeTenantId,
        expiresAt: sessions.expiresAt,
        impersonatedBy: sessions.impersonatedBy,
        userId: users.id,
        email: users.email,
        phone: users.phone,
        firstName: users.firstName,
        lastName: users.lastName,
        platformRole: users.platformRole,
        locale: users.locale,
        twoFactorEnabled: users.twoFactorEnabled,
        deletedAt: users.deletedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    const row = rows[0];
    if (!row || row.deletedAt) return null;

    const memberRows = await tx
      .select({ role: memberships.role, tenantId: memberships.tenantId })
      .from(memberships)
      .where(and(eq(memberships.userId, row.userId), isNull(memberships.deletedAt)));

    const roles = memberRows
      .filter((m) => !row.activeTenantId || m.tenantId === row.activeTenantId)
      .map((m) => m.role as Role);

    if (row.platformRole) roles.push(row.platformRole as Role);

    return {
      token: rawToken,
      activeTenantId: row.activeTenantId,
      impersonatedBy: row.impersonatedBy,
      expiresAt: row.expiresAt,
      roles,
      user: {
        id: row.userId,
        email: row.email,
        phone: row.phone,
        firstName: row.firstName,
        lastName: row.lastName,
        platformRole: (row.platformRole as Role) ?? null,
        locale: row.locale,
        twoFactorEnabled: row.twoFactorEnabled,
      },
    };
  });
}

export async function destroySession(rawToken: string): Promise<void> {
  await withBypassRls("auth:destroy-session", async (tx) => {
    await tx.delete(sessions).where(eq(sessions.token, hashToken(rawToken)));
  });
}

export async function switchTenant(rawToken: string, tenantId: string): Promise<void> {
  await withBypassRls("auth:switch-tenant", async (tx) => {
    await tx
      .update(sessions)
      .set({ activeTenantId: tenantId })
      .where(eq(sessions.token, hashToken(rawToken)));
  });
}

/** Tek kullanımlık token (magic link, davet, OTP). */
export async function issueVerificationToken(params: {
  identifier: string;
  /**
   * `phone_change` giriş OTP'sinden **ayrı** bir amaç: aynı havuzda olsalardı
   * girişe gönderilen kod numara değiştirmek için kullanılabilirdi (ve tersi).
   * `consumeVerificationToken` amacı da doğruluyor (`wrongPurpose`).
   */
  purpose:
    | "magic_link"
    | "otp"
    /**
     * Parolalı girişin ikinci adımı. `otp`'den ayrı tutuluyor: aynı amacı
     * paylaşsalardı `web/request` ile parola bilmeden alınan bir kod, parolalı
     * girişin ikinci faktörünü geçerdi.
     */
    | "login_otp"
    | "invite"
    | "password_reset"
    | "resident_verify"
    | "phone_change";
  tenantId?: string;
  ttlMinutes?: number;
  metadata?: Record<string, unknown>;
  /** OTP için sayısal kod verilir; yoksa rastgele token üretilir. */
  code?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = params.code ?? randomToken(24);
  const expiresAt = new Date(Date.now() + (params.ttlMinutes ?? 15) * 60_000);

  await withBypassRls("auth:issue-token", async (tx) => {
    await tx.insert(verificationTokens).values({
      identifier: params.identifier,
      tokenHash: hashToken(`${params.identifier}:${token}`),
      purpose: params.purpose,
      tenantId: params.tenantId,
      metadata: params.metadata ?? {},
      expiresAt,
    });
  });

  return { token, expiresAt };
}

/**
 * Doğrulama hatası nedenleri **kod** olarak döner; kullanıcıya gösterilecek
 * metin `app.login.tokenError.<reason>` altındadır (SPEC Bölüm 4.2 —
 * paketler dile bağımsızdır).
 */
export type ConsumeTokenReason = "invalid" | "used" | "expired" | "wrongPurpose";

export type ConsumeTokenResult =
  | { ok: true; metadata: Record<string, unknown>; tenantId: string | null }
  | { ok: false; reason: ConsumeTokenReason };

export async function consumeVerificationToken(params: {
  identifier: string;
  token: string;
  purpose: string;
}): Promise<ConsumeTokenResult> {
  const tokenHash = hashToken(`${params.identifier}:${params.token}`);

  return withBypassRls("auth:consume-token", async (tx) => {
    const rows = await tx
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.tokenHash, tokenHash))
      .limit(1);

    const row = rows[0];
    if (!row) return { ok: false as const, reason: "invalid" };
    if (row.consumedAt) return { ok: false as const, reason: "used" };
    if (row.expiresAt < new Date()) return { ok: false as const, reason: "expired" };
    if (row.purpose !== params.purpose) return { ok: false as const, reason: "wrongPurpose" };

    await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(verificationTokens.id, row.id));

    return {
      ok: true as const,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      tenantId: row.tenantId,
    };
  });
}

/** Server action / route handler için tenant bağlamı üretir. */
export function toTenantContext(
  session: ActiveSession,
  tenantSlug: string,
  extra: { ip?: string; userAgent?: string } = {},
): TenantContext {
  if (!session.activeTenantId) throw errors.forbidden("Aktif site seçilmemiş.");
  return {
    tenantId: session.activeTenantId,
    tenantSlug,
    userId: session.user.id,
    roles: session.roles,
    impersonatedBy: session.impersonatedBy ?? undefined,
    ip: extra.ip,
    userAgent: extra.userAgent,
    locale: session.user.locale || siteConfig.i18n.defaultLocale,
  };
}

export { getDb };
