import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  createSession,
  issueVerificationToken,
  SESSION_COOKIE,
} from "@yonetim/auth";
import {
  apiKeys,
  closeDb,
  memberships,
  sessions,
  tenants,
  users,
  verificationTokens,
  withBypassRls,
} from "@yonetim/db";

/**
 * A3 ÇIKIŞ ÖLÇÜTÜ — MIMARI-PLAN §14: "dört kimlik yolu da aynı
 * `RequestContext`'i üretiyor".
 *
 * Bu, mimarinin en kritik iddiası: panel cookie'si, mobil JWT, muhasebe
 * yazılımının API anahtarı ve worker'ın iç token'ı `ContextResolver`'da ayrı
 * ayrı çözülür, ama guard'dan sonra **ayırt edilemez** hale gelir. Ancak o
 * zaman yetki, RLS ve denetim tek kod yolunda kalır — dört yol dört farklı
 * bağlam üretseydi, her yeni kural dört kez yazılmak zorunda kalırdı.
 *
 * Test bunu `GET /v1/auth/me` üzerinden dört kimlikle çağırarak sınıyor:
 * `source` dışındaki her alan aynı olmalı.
 *
 * Çalışan bir API gerekiyor:
 *   pnpm --filter @yonetim/api build && PORT=3100 node apps/api/dist/apps/api/src/main.js
 *   INTEGRATION=1 pnpm vitest run tests/integration/identity-paths.test.ts
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN;

const TENANT = { id: randomUUID(), slug: `idtest-${Date.now()}` };
const USER_ID = randomUUID();
const PHONE = `+9055500${String(Date.now()).slice(-5)}`;
const OTP_CODE = "424242";
const API_KEY = `yk_live_${randomUUID().replace(/-/g, "")}`;

let sessionToken = "";
let apiReachable = false;

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!apiReachable) return;

  await withBypassRls("test:identity-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id,
      slug: TENANT.slug,
      name: "Kimlik Testi",
      type: "apartment",
      unitCount: 1,
      status: "active",
      settings: {},
    });
    await tx.insert(users).values({
      id: USER_ID,
      firstName: "Kimlik",
      lastName: "Testi",
      phone: PHONE,
      locale: "tr",
    });
    await tx.insert(memberships).values({
      tenantId: TENANT.id,
      userId: USER_ID,
      role: "manager",
      acceptedAt: new Date(),
    });
    await tx.insert(apiKeys).values({
      tenantId: TENANT.id,
      name: "kimlik-testi",
      keyHash: createHash("sha256").update(API_KEY).digest("hex"),
      prefix: "yk_live_",
      // Kapsam bilinçli olarak dar: API anahtarı yolunda rol değil scope var.
      scopes: ["unit:read"],
    });
  });

  const created = await createSession({ userId: USER_ID, tenantId: TENANT.id });
  sessionToken = created.token;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:identity-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, USER_ID));
      await tx
        .delete(verificationTokens)
        .where(eq(verificationTokens.identifier, PHONE));
      await tx.delete(apiKeys).where(eq(apiKeys.tenantId, TENANT.id));
      await tx.delete(memberships).where(eq(memberships.userId, USER_ID));
      await tx.delete(users).where(eq(users.id, USER_ID));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function me(headers: Record<string, string>) {
  const res = await fetch(`${BASE}/v1/auth/me`, { headers });
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

describe("dört kimlik yolu → tek RequestContext", () => {
  it("cookie yolu bağlamı çözer", async () => {
    if (!apiReachable) return;
    const { status, body } = await me({
      cookie: `${SESSION_COOKIE}=${sessionToken}`,
      "x-tenant-slug": TENANT.slug,
    });
    expect(status).toBe(200);
    expect(body.source).toBe("session");
    expect(body.tenantId).toBe(TENANT.id);
    expect(body.userId).toBe(USER_ID);
    expect(body.roles).toContain("manager");
  });

  it("mobil yolu aynı bağlamı üretir — yalnız source farklı", async () => {
    if (!apiReachable) return;

    // OTP kodu hash'lenerek saklanıyor, geri okunamaz; bu yüzden testin
    // bildiği bir kod ile token doğrudan basılıyor. Doğrulama yolu (tek
    // kullanımlık tüketim dahil) gerçek uçtan geçiyor.
    await issueVerificationToken({
      identifier: PHONE,
      purpose: "otp",
      ttlMinutes: 5,
      code: OTP_CODE,
      metadata: { userId: USER_ID, channel: "mobile" },
    });

    const tokenRes = await fetch(`${BASE}/v1/auth/mobile/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifier: PHONE,
        code: OTP_CODE,
        tenantSlug: TENANT.slug,
        device: "vitest",
      }),
    });
    expect(tokenRes.status).toBe(201);
    const pair = (await tokenRes.json()) as {
      accessToken: string;
      refreshToken: string;
    };

    const { status, body } = await me({
      authorization: `Bearer ${pair.accessToken}`,
    });
    expect(status).toBe(200);
    expect(body.source).toBe("mobile");
    expect(body.tenantId).toBe(TENANT.id);
    expect(body.userId).toBe(USER_ID);
    expect(body.roles).toContain("manager");

    const refresh = (token: string) =>
      fetch(`${BASE}/v1/auth/mobile/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: token }),
      });

    const refreshed = await refresh(pair.refreshToken);
    expect(refreshed.status).toBe(201);
    const next = (await refreshed.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    expect(next.refreshToken).not.toBe(pair.refreshToken);
    expect(
      (await me({ authorization: `Bearer ${next.accessToken}` })).status,
    ).toBe(200);

    // GERÇEK ROTASYON: kullanılmış refresh ikinci kez çalışmamalı. Bu olmadan
    // çalınan bir token, kurban kullanmaya devam etse bile aylarca geçerli
    // kalırdı — testin asıl koruduğu şey bu.
    expect((await refresh(pair.refreshToken)).status).toBe(401);

    // Çıkış oturum satırını siler; ona bağlı bütün token'lar ölür.
    const out = await fetch(`${BASE}/v1/auth/mobile/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: next.refreshToken }),
    });
    expect(out.status).toBe(201);
    const afterLogout = await fetch(`${BASE}/v1/auth/mobile/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: next.refreshToken }),
    });
    expect(afterLogout.status).toBe(401);
  });

  it("API anahtarı yolu aynı tenant'ı, rol yerine scope taşır", async () => {
    if (!apiReachable) return;
    const { status, body } = await me({ authorization: `Bearer ${API_KEY}` });
    expect(status).toBe(200);
    expect(body.source).toBe("api_key");
    expect(body.tenantId).toBe(TENANT.id);
    // Entegrasyonun kullanıcısı yok: yetki rolden değil kapsamdan geliyor.
    expect(body.userId).toBeNull();
    expect(body.scopes).toEqual(["unit:read"]);
  });

  it("iç token yolu (worker → api) aynı tenant'ı çözer", async () => {
    if (!apiReachable || !INTERNAL_TOKEN) return;
    const { status, body } = await me({
      "x-internal-token": INTERNAL_TOKEN,
      "x-tenant-id": TENANT.id,
    });
    expect(status).toBe(200);
    expect(body.source).toBe("internal");
    expect(body.tenantId).toBe(TENANT.id);
  });

  it("kimliksiz istek 401", async () => {
    if (!apiReachable) return;
    expect((await me({})).status).toBe(401);
  });

  it("OTP ucu kayıtlı olmayan numarada da varlığı sızdırmaz", async () => {
    if (!apiReachable) return;
    const res = await fetch(`${BASE}/v1/auth/mobile/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "+905559999999" }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { sent: boolean }).sent).toBe(true);
  });
});
