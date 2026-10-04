import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { PLATFORM_TENANT_ID } from "@yonetim/core";
import {
  blocks,
  closeDb,
  memberships,
  sessions,
  tenants,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Platform bağlamı — siteye üye olmayan süper admin.
 *
 * Süper admin artık bir siteye eklenmeden giriyor; kimliği `PLATFORM_TENANT_ID`
 * (nil UUID) ile çözülüyor. Bu dosya iki şeyi birlikte sınıyor: platform
 * ekranlarının açıldığını VE bu kimliğin hiçbir sitenin verisine RLS'ten
 * sızamadığını. İkincisi asıl risk: "kimliksiz ama yetkili" bir bağlam,
 * yanlış kurulursa bütün sitelerin verisini görebilirdi.
 */

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

const TENANT = { id: randomUUID(), slug: `platform-ctx-${Date.now()}` };
const SUPER_ID = randomUUID();
const LONER_ID = randomUUID();

let superCookie = "";
let lonerCookie = "";
let apiReachable = false;

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!apiReachable) return;

  await withBypassRls("test:platform-ctx-setup", async (tx) => {
    // Verisi olan bir site: platform bağlamı bunu GÖRMEMELİ.
    await tx.insert(tenants).values({
      id: TENANT.id,
      slug: TENANT.slug,
      name: "Platform Bağlamı Testi",
      type: "apartment",
      unitCount: 1,
      status: "active",
      settings: {},
    });
    const [block] = await tx
      .insert(blocks)
      .values({ tenantId: TENANT.id, name: "A", floorCount: 1, unitCount: 1 })
      .returning({ id: blocks.id });
    await tx.insert(units).values({
      tenantId: TENANT.id,
      blockId: block!.id,
      number: "1",
      floor: 1,
      type: "flat",
      areaM2: "100",
      landShare: "1",
    });

    await tx.insert(users).values([
      {
        id: SUPER_ID,
        firstName: "Platform",
        lastName: "Sahibi",
        email: `super-${Date.now()}@ornek.test`,
        locale: "tr",
        platformRole: "super_admin",
      },
      // Platform rolü de üyeliği de olmayan kullanıcı — bağlam almamalı.
      {
        id: LONER_ID,
        firstName: "Yalnız",
        lastName: "Kullanıcı",
        email: `loner-${Date.now()}@ornek.test`,
        locale: "tr",
      },
    ]);
  });

  superCookie = `${SESSION_COOKIE}=${(await createSession({ userId: SUPER_ID })).token}`;
  lonerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: LONER_ID })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:platform-ctx-cleanup", async (tx) => {
      await tx.delete(sessions).where(inArray(sessions.userId, [SUPER_ID, LONER_ID]));
      await tx.delete(memberships).where(inArray(memberships.userId, [SUPER_ID, LONER_ID]));
      await tx.delete(users).where(inArray(users.id, [SUPER_ID, LONER_ID]));
      await tx.delete(units).where(eq(units.tenantId, TENANT.id));
      await tx.delete(blocks).where(eq(blocks.tenantId, TENANT.id));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function get(path: string, cookie: string, extra: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie, ...extra } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("platform bağlamı — siteye üye olmayan süper admin", () => {
  it("panel bağlamı 'platform' olarak çözülüyor", async ({ skip }) => {
    if (!apiReachable) skip();
    const { status, body } = await get("/v1/auth/context", superCookie);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      tenantId: PLATFORM_TENANT_ID,
      tenantSlug: "platform",
      tenantStatus: "platform",
    });
    expect(body.roles).toContain("super_admin");
  });

  it("platform özeti ve hesap listesi açılıyor ve test sitesini içeriyor", async ({ skip }) => {
    if (!apiReachable) skip();
    const overview = await get("/v1/panel/platform/overview", superCookie);
    expect(overview.status).toBe(200);

    const accounts = await get(
      `/v1/panel/platform/accounts?q=${encodeURIComponent("Platform Bağlamı Testi")}`,
      superCookie,
    );
    expect(accounts.status).toBe(200);
    expect(JSON.stringify(accounts.body)).toContain(`tenant:${TENANT.id}`);
  });

  it("platform bağlamı hiçbir sitenin verisini RLS'ten okuyamıyor", async ({ skip }) => {
    if (!apiReachable) skip();
    const { status, body } = await get("/v1/panel/units", superCookie);
    // Ya boş liste ya ret — ama ASLA test sitesinin dairesi değil.
    if (status === 200) {
      const rows = (body.items ?? body.data ?? body) as unknown;
      expect(JSON.stringify(rows)).not.toContain(TENANT.id);
      expect(Array.isArray(rows) ? rows.length : (rows as { length?: number }).length ?? 0).toBe(0);
    } else {
      expect(status).toBeGreaterThanOrEqual(400);
    }
  });

  it("platform bağlamı siteye yazamıyor (RLS WITH CHECK)", async ({ skip }) => {
    if (!apiReachable) skip();
    const res = await fetch(`${BASE}/v1/panel/units`, {
      method: "POST",
      headers: { cookie: superCookie, origin: PANEL_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ number: "99", floor: 1, type: "flat" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const count = await withBypassRls("test:platform-ctx-check", async (tx) =>
      tx.select({ id: units.id }).from(units).where(eq(units.tenantId, TENANT.id)),
    );
    expect(count).toHaveLength(1);
  });

  it("platform rolü ve üyeliği olmayan kullanıcı bağlam almıyor", async ({ skip }) => {
    if (!apiReachable) skip();
    const { status } = await get("/v1/auth/context", lonerCookie);
    expect(status).toBe(401);
  });

  it("platform rolü olmayan kullanıcı platform uçlarına giremiyor", async ({ skip }) => {
    if (!apiReachable) skip();
    const { status } = await get("/v1/panel/platform/overview", lonerCookie);
    expect(status).toBeGreaterThanOrEqual(401);
  });
});
