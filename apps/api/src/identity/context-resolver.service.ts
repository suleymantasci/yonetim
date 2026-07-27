import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Request } from "express";

import { resolveSession, SESSION_COOKIE } from "@yonetim/auth";
import type { Permission, Role } from "@yonetim/core";
import { apiKeys, memberships, tenants } from "@yonetim/db";

import { env } from "../infra/config/env";
import type { RequestContext } from "../infra/cls/request-context";
import { DbService } from "../infra/db/db.service";
import { RedisService } from "../infra/redis/redis.service";
import { verifyJwt } from "./jwt.util";

const API_KEY_PREFIX = "yk_live_";
const SESSION_CACHE_PREFIX = "sess:v1:";

/**
 * Dört kimlik yolu → tek `RequestContext` — MIMARI-PLAN §8.1.
 *
 * Oturum otoritesi **burada**, Next'te değil. Next cookie'yi olduğu gibi
 * iletiyor; "ben bu tenant'ın adminiyim" iddiasını imzalama yetkisi render
 * katmanına verilmiyor. Bunun bedeli istek başına bir oturum araması, karşılığı
 * anında etkili iptal. Bedel Redis'te 60 sn TTL ile kapanıyor (§17 kararı 5) —
 * rol değişimi ve çıkışta önbellek **anında** düşürüldüğü için 60 sn yalnızca
 * en kötü durum penceresi.
 */
@Injectable()
export class ContextResolver {
  private readonly logger = new Logger(ContextResolver.name);

  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  /* ---------------------------------------------------------------- *
   * 1) Panel + sakin portalı — cookie
   * ---------------------------------------------------------------- */

  async fromSessionCookie(req: Request): Promise<RequestContext | null> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) return null;

    const slug = headerValue(req, "x-tenant-slug");
    const cacheKey = `${SESSION_CACHE_PREFIX}${sha256(token)}:${slug ?? "-"}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedIdentity;
      return this.finish(req, { ...parsed, source: "session" });
    }

    const session = await resolveSession(token);
    if (!session) return null;

    const resolved = await this.resolveTenantForUser(
      session.user.id,
      session.activeTenantId,
      slug,
    );
    if (!resolved) return null;

    const roles = [...resolved.roles];
    if (session.user.platformRole) roles.push(session.user.platformRole);
    if (roles.length === 0) return null;

    const identity: CachedIdentity = {
      tenantId: resolved.tenantId,
      tenantSlug: resolved.tenantSlug,
      userId: session.user.id,
      roles,
      scopes: [],
      impersonatedBy: session.impersonatedBy ?? undefined,
      locale: session.user.locale || "tr",
    };

    await this.redis.setEx(
      cacheKey,
      env().SESSION_CACHE_TTL,
      JSON.stringify(identity),
    );
    return this.finish(req, { ...identity, source: "session" });
  }

  /**
   * Oturum önbelleğini düşürür — çıkış, rol değişimi, tenant değiştirme.
   * Slug varyantları da silindiği için kullanıcı hangi site üzerinden bakarsa
   * baksın yeni yetkiyi anında görür.
   */
  async invalidateSession(rawToken: string): Promise<void> {
    const client = this.redis.raw();
    const prefix = `${SESSION_CACHE_PREFIX}${sha256(rawToken)}:`;
    if (!client) return;
    const keys = await client.keys(`${prefix}*`).catch(() => [] as string[]);
    if (keys.length > 0) await this.redis.del(...keys);
  }

  /* ---------------------------------------------------------------- *
   * 2) Mobil (Faz 17) — access token
   * ---------------------------------------------------------------- */

  async fromMobileJwt(req: Request): Promise<RequestContext | null> {
    const bearer = readBearer(req);
    // API anahtarları da Bearer taşıyor; önek ile ayrılıyorlar.
    if (!bearer || bearer.startsWith(API_KEY_PREFIX)) return null;

    const payload = verifyJwt(bearer, env().AUTH_SECRET);
    if (!payload || payload.typ !== "access") return null;

    const resolved = await this.resolveTenantForUser(
      payload.sub,
      payload.tid,
      null,
    );
    if (!resolved) return null;

    const platformRole = await this.platformRoleOf(payload.sub);
    const roles = [...resolved.roles];
    if (platformRole) roles.push(platformRole);
    if (roles.length === 0) return null;

    return this.finish(req, {
      tenantId: resolved.tenantId,
      tenantSlug: resolved.tenantSlug,
      userId: payload.sub,
      roles,
      scopes: [],
      locale: "tr",
      source: "mobile",
    });
  }

  /* ---------------------------------------------------------------- *
   * 3) Muhasebe yazılımı / yönetim şirketi — API anahtarı
   * ---------------------------------------------------------------- */

  async fromApiKey(req: Request): Promise<RequestContext | null> {
    const bearer = readBearer(req);
    if (!bearer?.startsWith(API_KEY_PREFIX)) return null;

    const keyHash = sha256(bearer);
    const record = await this.db.bypass("api:key-lookup", async (tx) => {
      const rows = await tx
        .select({
          id: apiKeys.id,
          tenantId: apiKeys.tenantId,
          scopes: apiKeys.scopes,
          rateLimitPerMinute: apiKeys.rateLimitPerMinute,
          expiresAt: apiKeys.expiresAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() < Date.now())
      return null;

    // Site askıya alınmışsa API de kapanır; yoksa ödemesi durmuş bir site
    // entegrasyon üzerinden çalışmaya devam ederdi.
    const tenant = await this.db.bypass("api:tenant-status", async (tx) => {
      const rows = await tx
        .select({ id: tenants.id, slug: tenants.slug, status: tenants.status })
        .from(tenants)
        .where(and(eq(tenants.id, record.tenantId), isNull(tenants.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!tenant) return null;
    if (!["active", "trial", "past_due"].includes(tenant.status)) return null;

    // Kullanım izi — sayaç güncellenemezse istek yine işlenir (telemetri).
    void this.db
      .bypass("api:key-touch", async (tx) => {
        await tx
          .update(apiKeys)
          .set({
            lastUsedAt: new Date(),
            requestCount: sql`${apiKeys.requestCount} + 1`,
          })
          .where(eq(apiKeys.id, record.id));
      })
      .catch(() => undefined);

    return this.finish(req, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      apiKeyId: record.id,
      roles: [],
      scopes: Array.isArray(record.scopes)
        ? (record.scopes as Permission[])
        : [],
      locale: "tr",
      source: "api_key",
      rateLimitPerMinute: record.rateLimitPerMinute,
    });
  }

  /* ---------------------------------------------------------------- *
   * 4) worker → api — iç token
   * ---------------------------------------------------------------- */

  async fromInternalToken(req: Request): Promise<RequestContext | null> {
    const expected = env().INTERNAL_API_TOKEN;
    const provided = headerValue(req, "x-internal-token");
    if (!expected || !provided || provided !== expected) return null;

    const tenantId = headerValue(req, "x-tenant-id");
    if (!tenantId) return null;

    const tenant = await this.db.bypass("internal:tenant", async (tx) => {
      const rows = await tx
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!tenant) return null;

    return this.finish(req, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      userId: headerValue(req, "x-internal-user") ?? undefined,
      roles: ["super_admin"] as Role[],
      scopes: [],
      locale: "tr",
      source: "internal",
    });
  }

  /* ---------------------------------------------------------------- *
   * Ortak
   * ---------------------------------------------------------------- */

  /**
   * Kullanıcının hangi tenant'ta çalıştığını ve o tenant'taki rollerini çözer.
   * `slug` başlığı çoklu üyelikte site değiştirmeye yarar; üyelik yoksa
   * fail-closed (null) döner — yatay yetki yükseltmesi buradan geçmez.
   */
  private async resolveTenantForUser(
    userId: string,
    activeTenantId: string | null,
    slug: string | null,
  ): Promise<{ tenantId: string; tenantSlug: string; roles: Role[] } | null> {
    return this.db.bypass("ctx:resolve-tenant", async (tx) => {
      let tenantId = activeTenantId;

      if (slug) {
        const rows = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(and(eq(tenants.slug, slug), isNull(tenants.deletedAt)))
          .limit(1);
        if (rows[0]) tenantId = rows[0].id;
      }

      if (!tenantId) {
        const rows = await tx
          .select({ tenantId: memberships.tenantId })
          .from(memberships)
          .where(
            and(eq(memberships.userId, userId), isNull(memberships.deletedAt)),
          )
          .limit(1);
        tenantId = rows[0]?.tenantId ?? null;
      }
      if (!tenantId) return null;

      const tenantRows = await tx
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
        .limit(1);
      const tenant = tenantRows[0];
      if (!tenant) return null;

      const roleRows = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.tenantId, tenant.id),
            isNull(memberships.deletedAt),
          ),
        );

      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        roles: roleRows.map((r) => r.role as Role),
      };
    });
  }

  private async platformRoleOf(userId: string): Promise<Role | null> {
    return this.db.bypass("ctx:platform-role", async (tx) => {
      const rows = await tx.execute<{ platform_role: string | null }>(
        sql`SELECT platform_role FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1`,
      );
      const row = (rows as unknown as { platform_role: string | null }[])[0];
      return (row?.platform_role as Role | null) ?? null;
    });
  }

  /** İstek başlıklarından türeyen alanları ekler (IP, UA, requestId, gerekçe). */
  private finish(
    req: Request,
    identity: Omit<RequestContext, "requestId" | "ip" | "userAgent"> & {
      rateLimitPerMinute?: number;
    },
  ): RequestContext {
    const { rateLimitPerMinute: _ignored, ...rest } = identity;
    return {
      ...rest,
      ip: headerValue(req, "x-client-ip") ?? req.ip,
      userAgent: headerValue(req, "user-agent") ?? undefined,
      requestId: headerValue(req, "x-request-id") ?? randomUUID(),
      changeReason: headerValue(req, "x-change-reason") ?? undefined,
    };
  }
}

interface CachedIdentity {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  roles: Role[];
  scopes: Permission[];
  impersonatedBy?: string;
  locale: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function headerValue(req: Request, name: string): string | null {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

function readBearer(req: Request): string | null {
  const header = headerValue(req, "authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

/**
 * Cookie başlığından tek bir değeri okur. `cookie-parser` middleware'i
 * eklemiyoruz: tek bir cookie okunuyor ve bu, istek nesnesine global bir
 * `cookies` alanı iliştirmekten daha az yüzey.
 */
function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}
