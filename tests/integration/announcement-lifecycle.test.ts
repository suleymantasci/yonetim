import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { announcements, closeDb, memberships, sessions, tenants, users, withBypassRls } from "@yonetim/db";

/** Duyuru yaşam döngüsü — taslak düzenle/sil, yayımla, yayından kaldır. */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const TENANT = { id: randomUUID(), slug: `duyuru-${Date.now()}` };
const MANAGER = randomUUID();
let cookie = "";

const apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;
  await withBypassRls("test:ann-setup", async (tx) => {
    await tx.insert(tenants).values({ id: TENANT.id, slug: TENANT.slug, name: "Duyuru Testi", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values({ id: MANAGER, firstName: "Yönetici", lastName: "Duyuru", phone: `+9055509${String(Date.now()).slice(-5)}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: TENANT.id, userId: MANAGER, role: "manager", acceptedAt: new Date() });
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: TENANT.id })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:ann-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(announcements).where(eq(announcements.tenantId, TENANT.id));
      await tx.delete(memberships).where(eq(memberships.tenantId, TENANT.id));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: PANEL_ORIGIN, "x-tenant-slug": TENANT.slug, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const draft = { title: "Su kesintisi", body: "Yarın 10:00-14:00 arası su kesintisi olacaktır.", audience: "all", channels: ["in_app"], isUrgent: false, publish: false };

describe.skipIf(!apiReachable)("duyuru yaşam döngüsü", () => {
  let id = "";
  let deleteId = "";

  it("taslak düzenleniyor ve yayımlanıyor; yayımlanmış düzenlenemiyor", async () => {
    id = String((await call("POST", "/v1/panel/communication/announcements", draft)).body.id);
    expect((await call("PATCH", `/v1/panel/communication/announcements/${id}`, { ...draft, title: "Su kesintisi (güncel)" })).status).toBe(200);
    expect((await call("PATCH", `/v1/panel/communication/announcements/${id}`, { ...draft, publish: true })).body.published).toBe(true);
    expect((await call("PATCH", `/v1/panel/communication/announcements/${id}`, draft)).status).toBe(409);
    expect((await call("DELETE", `/v1/panel/communication/announcements/${id}`)).status).toBe(409);
  });

  it("taslak siliniyor", async () => {
    deleteId = String((await call("POST", "/v1/panel/communication/announcements", draft)).body.id);
    expect((await call("DELETE", `/v1/panel/communication/announcements/${deleteId}`)).status).toBe(200);
    const [row] = await withBypassRls("test:ann-read", (tx) => tx.select().from(announcements).where(eq(announcements.id, deleteId)));
    expect(row?.deletedAt).not.toBeNull();
  });

  it("yayımlanmış duyuru gerekçeyle bir kez yayından kaldırılıyor", async () => {
    expect((await call("POST", `/v1/panel/communication/announcements/${id}/withdraw`, { reason: "kısa" })).status).toBe(422);
    expect((await call("POST", `/v1/panel/communication/announcements/${id}/withdraw`, { reason: "Kesinti iptal edildi, duyuru geçersiz" })).status).toBe(201);
    expect((await call("POST", `/v1/panel/communication/announcements/${id}/withdraw`, { reason: "Kesinti iptal edildi, duyuru geçersiz" })).status).toBe(409);
  });
});
