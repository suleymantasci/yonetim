import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import {
  accessRequests,
  closeDb,
  memberships,
  notifications,
  sessions,
  subscriptions,
  tenants,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Site ekleme, deneme süresi mirası, site geçişi ve erişim talebi bildirimi.
 *
 * Çalıştırma: API açıkken `INTEGRATION=1 API_INTERNAL_URL=... pnpm vitest run`.
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const STAMP = String(Date.now()).slice(-6);

const SITE_A = { id: randomUUID(), slug: `deneme-a-${STAMP}` };
const SITE_B = { id: randomUUID(), slug: `deneme-b-${STAMP}` };
const MANAGER = randomUUID();
const RESIDENT = randomUUID();
const OUTSIDER = randomUUID();
const createdTenantIds: string[] = [];

const DAY = 86_400_000;
const A_TRIAL_END = new Date(Date.now() + 1 * DAY); // 1 gün kaldı

let cookie = "";
let residentCookie = "";
let apiReachable = false;

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!apiReachable) return;

  await withBypassRls("test:signup-trial-setup", async (tx) => {
    await tx.insert(tenants).values([
      { id: SITE_A.id, slug: SITE_A.slug, name: "Deneme A", type: "apartment", unitCount: 5, status: "trial", trialStartedAt: new Date(), trialEndsAt: A_TRIAL_END, settings: {} },
      { id: SITE_B.id, slug: SITE_B.slug, name: "Deneme B", type: "apartment", unitCount: 5, status: "trial", trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 20 * DAY), settings: {} },
    ]);
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Çoklu", lastName: "Yönetici", phone: `+9055511${STAMP}`, locale: "tr" },
      { id: RESIDENT, firstName: "Salt", lastName: "Sakin", phone: `+9055512${STAMP}`, locale: "tr" },
      { id: OUTSIDER, firstName: "Dış", lastName: "Kişi", phone: `+9055513${STAMP}`, locale: "tr" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: SITE_A.id, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: SITE_B.id, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: SITE_A.id, userId: RESIDENT, role: "owner", acceptedAt: new Date() },
    ]);
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: SITE_A.id })).token}`;
  residentCookie = `${SESSION_COOKIE}=${(await createSession({ userId: RESIDENT, tenantId: SITE_A.id })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:signup-trial-cleanup", async (tx) => {
      const ids = [SITE_A.id, SITE_B.id, ...createdTenantIds];
      await tx.delete(sessions).where(inArray(sessions.userId, [MANAGER, RESIDENT, OUTSIDER]));
      await tx.delete(notifications).where(inArray(notifications.tenantId, ids));
      await tx.delete(accessRequests).where(inArray(accessRequests.tenantId, ids));
      await tx.delete(subscriptions).where(inArray(subscriptions.tenantId, ids));
      await tx.delete(memberships).where(inArray(memberships.tenantId, ids));
      await tx.delete(users).where(inArray(users.id, [MANAGER, RESIDENT, OUTSIDER]));
      await tx.delete(tenants).where(inArray(tenants.id, ids));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, opts: { cookie?: string; body?: unknown; slug?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      origin: ORIGIN,
      ...(opts.slug ? { "x-tenant-slug": opts.slug } : {}),
      "content-type": "application/json",
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const newSite = { propertyName: "Üçüncü Site", propertyType: "apartment", city: "Ankara", unitCount: 10, generateUnits: false };

describe.skipIf(!process.env.INTEGRATION)("site ekleme ve deneme süresi", () => {
  it("bağlam deneme bitişini taşıyor", async () => {
    if (!apiReachable) return;
    const { status, body } = await call("GET", "/v1/auth/context", { cookie, slug: SITE_A.slug });
    expect(status).toBe(200);
    expect(body.tenantStatus).toBe("trial");
    expect(new Date(String(body.tenantTrialEndsAt)).getTime()).toBe(A_TRIAL_END.getTime());
  });

  it("yeni site mevcut denemenin en erken bitişini devralıyor (süre uzamıyor)", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/auth/setup", { cookie, body: newSite });
    expect(res.status).toBe(201);
    const tenantId = String(res.body.tenantId);
    createdTenantIds.push(tenantId);

    const [row] = await withBypassRls("test:read-trial", (tx) =>
      tx.select({ end: tenants.trialEndsAt }).from(tenants).where(eq(tenants.id, tenantId)),
    );
    // A: 1 gün, B: 20 gün → en erken (A) devralınır, 30 gün verilmez.
    expect(row!.end!.getTime()).toBe(A_TRIAL_END.getTime());

    const [sub] = await withBypassRls("test:read-sub", (tx) =>
      tx.select({ end: subscriptions.trialEndsAt }).from(subscriptions).where(eq(subscriptions.tenantId, tenantId)),
    );
    // Plan seed'i yoksa abonelik açılmıyor; açıldıysa aynı tarihi taşımalı.
    if (sub) expect(sub.end!.getTime()).toBe(A_TRIAL_END.getTime());
  });

  it("yalnız sakin rolü olan kullanıcı site açamıyor", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/auth/setup", { cookie: residentCookie, body: newSite });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!process.env.INTEGRATION)("site geçişi", () => {
  it("üyesi olduğu siteye geçiyor", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/auth/web/switch-tenant", { cookie, body: { tenantId: SITE_B.id } });
    expect(res.status).toBe(204);
    const ctx = await call("GET", "/v1/auth/context", { cookie });
    expect(ctx.body.tenantId).toBe(SITE_B.id);
  });

  it("üyesi olmadığı siteye geçemiyor", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/auth/web/switch-tenant", { cookie: residentCookie, body: { tenantId: SITE_B.id } });
    expect(res.status).toBe(403);
  });
});

describe.skipIf(!process.env.INTEGRATION)("erişim talebi bildirimi", () => {
  const request = {
    tenantSlug: SITE_A.slug,
    fullName: "Yeni Başvuran",
    phone: `0555 514 ${STAMP.slice(0, 2)} ${STAMP.slice(2, 4)}`,
    unitLabel: "7",
    claimedRelation: "owner",
    acceptedTerms: true,
  };

  it("yeni talep yöneticiye uygulama içi bildirim düşürüyor; tekrar çoğaltmıyor", async () => {
    if (!apiReachable) return;
    expect((await call("POST", "/v1/auth/access-request", { body: request })).status).toBeLessThan(300);
    expect((await call("POST", "/v1/auth/access-request", { body: request })).status).toBeLessThan(300);

    const rows = await withBypassRls("test:read-notif", (tx) =>
      tx.select({ id: notifications.id, userId: notifications.userId, channel: notifications.channel })
        .from(notifications)
        .where(eq(notifications.template, "access_request_new")),
    );
    const mine = rows.filter((r) => r.userId === MANAGER);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.channel).toBe("in_app");
    // Sakin (owner) yönetici değil: bildirim almamalı.
    expect(rows.some((r) => r.userId === RESIDENT)).toBe(false);
  });
});
