import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { rateLimit, hasPermission, resolveSession, SESSION_COOKIE } from "@yonetim/auth";
import { AppError, errors, type Permission, type Role } from "@yonetim/core";
import { apiKeys, memberships, tenants, withBypassRls } from "@yonetim/db";

/**
 * API v1 altyapısı — GAP 4.8.3 / TD-03 / TD-04, SPEC Bölüm 21.2.
 *
 * TASARIM KARARLARI:
 *
 * 1. **Server Action'lar UI için, REST dış dünya için.** Panel ekranları
 *    Server Action kullanır (tek round-trip, tip güvenli). `/api/v1/*` yalnız
 *    dışarıdan erişim içindir: muhasebe yazılımı, yönetim şirketinin kendi
 *    paneli, mobil uygulama (Faz 17). Bu ayrım aynı mantığı iki kez yazmayı
 *    önlüyor — REST uçları sorgu/aksiyon katmanını çağırır, kendi mantığı yok.
 *
 * 2. **Tek hata zarfı**: `{ error: { code, message, details } }`. `AppError`
 *    sınıfı bunu zaten üretiyor; burada HTTP durumuna bağlanıyor.
 *
 * 3. **İki kimlik yolu**: API anahtarı (`Authorization: Bearer yk_...`) veya
 *    mevcut oturum çerezi. Çerez yolu, panelin kendi istemci kodunun aynı
 *    uçları kullanabilmesi için — ayrı bir istemci anahtarı dağıtmak
 *    tarayıcıda sır tutmaya çalışmak olurdu.
 *
 * 4. **Hız sınırı her istekte**: anahtar başına kendi limiti, oturum yolunda
 *    genel API limiti. Sınır aşımında `Retry-After` başlığı döner.
 */

export interface ApiContext {
  tenantId: string;
  /** Anahtar kimliği (varsa) — denetim kaydına yazılır. */
  apiKeyId?: string;
  userId?: string;
  roles: Role[];
  scopes: Permission[];
  source: "api_key" | "session";
}

const KEY_PREFIX = "yk_live_";

/** Açık anahtardan saklanan hash'i üretir. */
export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Hata → HTTP yanıtı. Beklenmeyen hatalar 500'e düşer ve mesajı sızmaz;
 * sunucu logunda tam hata kalır.
 */
export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), { status: error.status });
  }
  if (error instanceof z.ZodError) {
    const validation = errors.validation("Girdi doğrulaması başarısız.", error.flatten());
    return NextResponse.json(validation.toJSON(), { status: validation.status });
  }
  console.error("[api]", error);
  const internal = errors.internal();
  return NextResponse.json(internal.toJSON(), { status: internal.status });
}

export function apiOk<T>(data: T, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  return NextResponse.json({ data }, init);
}

export function apiList<T>(
  items: T[],
  meta: { page: number; pageSize: number; total: number },
): NextResponse {
  return NextResponse.json({
    data: items,
    meta: {
      ...meta,
      pageCount: Math.max(1, Math.ceil(meta.total / meta.pageSize)),
    },
  });
}

/* ------------------------------------------------------------------ *
 * Kimlik doğrulama
 * ------------------------------------------------------------------ */

/**
 * İsteği doğrular ve tenant bağlamını çözer.
 *
 * `permission` verildiyse yetki de kontrol edilir. API anahtarı yolunda yetki
 * anahtarın `scopes` listesinden gelir (rol değil): entegrasyona "sadece borç
 * okuma" verilebilmeli.
 */
export async function authenticateApi(
  request: Request,
  permission?: Permission,
): Promise<ApiContext> {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ") && header.slice(7).startsWith(KEY_PREFIX)) {
    return authenticateWithKey(request, header.slice(7), permission);
  }

  return authenticateWithSession(request, permission);
}

async function authenticateWithKey(
  request: Request,
  plainKey: string,
  permission?: Permission,
): Promise<ApiContext> {
  const keyHash = hashApiKey(plainKey);

  const record = await withBypassRls("api:key-lookup", async (tx) => {
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

  if (!record) throw errors.unauthorized("Geçersiz API anahtarı.");
  if (record.revokedAt) throw errors.unauthorized("API anahtarı iptal edilmiş.");
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    throw errors.unauthorized("API anahtarının süresi dolmuş.");
  }

  // Site askıya alınmışsa API de kapanır; yoksa ödemesi durmuş bir site
  // entegrasyon üzerinden çalışmaya devam ederdi.
  const tenantActive = await withBypassRls("api:tenant-status", async (tx) => {
    const rows = await tx
      .select({ status: tenants.status })
      .from(tenants)
      .where(and(eq(tenants.id, record.tenantId), isNull(tenants.deletedAt)))
      .limit(1);
    const status = rows[0]?.status;
    return status === "active" || status === "trial" || status === "past_due";
  });
  if (!tenantActive) throw errors.forbidden("Site erişimi askıya alınmış.");

  const limit = await rateLimit(
    { key: "api_key", limit: record.rateLimitPerMinute, windowSeconds: 60 },
    record.id,
  );
  if (!limit.allowed) throw errors.rateLimited();

  const scopes = Array.isArray(record.scopes) ? (record.scopes as Permission[]) : [];
  if (permission && !scopes.includes(permission)) {
    throw errors.forbidden(`Anahtarın bu yetkisi yok: ${permission}`);
  }

  // Kullanım izi — hangi anahtarın ne zaman çalıştığı görülebilsin.
  void withBypassRls("api:key-touch", async (tx) => {
    await tx
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), requestCount: sql`${apiKeys.requestCount} + 1` })
      .where(eq(apiKeys.id, record.id));
  }).catch(() => {
    // Sayaç güncellenemezse istek yine işlenir: telemetri, kritik yol değil.
  });

  return {
    tenantId: record.tenantId,
    apiKeyId: record.id,
    roles: [],
    scopes,
    source: "api_key",
  };
}

async function authenticateWithSession(
  request: Request,
  permission?: Permission,
): Promise<ApiContext> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);

  const session = await resolveSession(token ? decodeURIComponent(token) : undefined);
  if (!session) throw errors.unauthorized();

  const slug = request.headers.get("x-tenant-slug");
  const resolved = await withBypassRls("api:session-tenant", async (tx) => {
    let tenantId = session.activeTenantId;
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
        .where(and(eq(memberships.userId, session.user.id), isNull(memberships.deletedAt)))
        .limit(1);
      tenantId = rows[0]?.tenantId ?? null;
    }
    if (!tenantId) return null;

    const roleRows = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, session.user.id),
          eq(memberships.tenantId, tenantId),
          isNull(memberships.deletedAt),
        ),
      );
    return { tenantId, roles: roleRows.map((row) => row.role as Role) };
  });

  if (!resolved) throw errors.forbidden("Erişilebilir site bulunamadı.");

  const roles = [...resolved.roles];
  if (session.user.platformRole) roles.push(session.user.platformRole);
  if (roles.length === 0) throw errors.forbidden();

  const identifier = `${session.user.id}:${resolved.tenantId}`;
  const limit = await rateLimit({ key: "api", limit: 100, windowSeconds: 60 }, identifier);
  if (!limit.allowed) throw errors.rateLimited();

  if (permission && !hasPermission(roles, permission)) {
    throw errors.forbidden(`Bu işlem için yetkiniz yok (${permission}).`);
  }

  return {
    tenantId: resolved.tenantId,
    userId: session.user.id,
    roles,
    scopes: [],
    source: "session",
  };
}

/** API bağlamını `AppContext` benzeri bir şekle çevirir (sorgu katmanı için). */
export function toQueryContext(ctx: ApiContext) {
  return {
    tenantId: ctx.tenantId,
    tenantSlug: "",
    userId: ctx.userId ?? ctx.apiKeyId ?? "api",
    roles: ctx.roles,
    locale: "tr",
  };
}

/* ------------------------------------------------------------------ *
 * Sorgu parametreleri
 * ------------------------------------------------------------------ */

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
});

/**
 * `URLSearchParams`'ı doğrulanmış sayfalama nesnesine çevirir.
 * `pageSize` üst sınırı 200: dış entegrasyonun tüm tabloyu tek istekte
 * çekmesini engeller (bellek ve süre koruması).
 */
export function parsePagination(url: URL) {
  return paginationSchema.parse({
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    direction: url.searchParams.get("direction") ?? undefined,
  });
}

/** JSON gövdesini şemayla doğrular; boş/bozuk gövdede anlaşılır hata verir. */
export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw errors.validation("Geçersiz JSON gövdesi.");
  }
  return schema.parse(payload);
}
