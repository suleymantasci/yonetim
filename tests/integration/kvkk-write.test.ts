import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  closeDb,
  dataBreaches,
  kvkkRequests,
  memberships,
  sessions,
  tenants,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * KVKK yazma yolları — başvuru (md.11/13), silme (md.7), ihlal (md.12/5).
 */

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

const TENANT = { id: randomUUID(), slug: `kvkk-${Date.now()}` };
const MANAGER = randomUUID();
const RESIDENT = randomUUID();
let managerCookie = "";
let residentCookie = "";

const apiReachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;
  const stamp = String(Date.now()).slice(-5);
  await withBypassRls("test:kvkk-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id, slug: TENANT.slug, name: "KVKK Testi",
      type: "apartment", unitCount: 1, status: "active", settings: {},
    });
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Yönetici", lastName: "KVKK", phone: `+9055505${stamp}`, locale: "tr" },
      {
        id: RESIDENT, firstName: "Ayşe", lastName: "Silinsin", email: `ayse-${stamp}@ornek.test`,
        phone: `+9055506${stamp}`, bloodType: "A+", locale: "tr",
      },
    ]);
    await tx.insert(memberships).values([
      { tenantId: TENANT.id, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: TENANT.id, userId: RESIDENT, role: "owner", acceptedAt: new Date() },
    ]);
  });
  managerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: TENANT.id })).token}`;
  residentCookie = `${SESSION_COOKIE}=${(await createSession({ userId: RESIDENT, tenantId: TENANT.id })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:kvkk-cleanup", async (tx) => {
      await tx.delete(sessions).where(inArray(sessions.userId, [MANAGER, RESIDENT]));
      await tx.delete(kvkkRequests).where(eq(kvkkRequests.tenantId, TENANT.id));
      await tx.delete(dataBreaches).where(eq(dataBreaches.tenantId, TENANT.id));
      await tx.delete(memberships).where(eq(memberships.tenantId, TENANT.id));
      await tx.delete(users).where(inArray(users.id, [MANAGER, RESIDENT]));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, body?: unknown, cookie = managerCookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: PANEL_ORIGIN, "x-tenant-slug": TENANT.slug, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!apiReachable)("KVKK yazma yolları", () => {
  let erasureId = "";

  it("yönetici başvuru kaydediyor; yasal son gün 30 gün sonra", async () => {
    const res = await call("POST", "/v1/panel/kvkk/requests", {
      type: "erasure",
      userId: RESIDENT,
      detail: "Dilekçe ile kişisel verilerimin silinmesini talep ediyorum.",
    });
    expect(res.status).toBe(201);
    erasureId = String(res.body.id);

    const overview = await call("GET", "/v1/panel/kvkk");
    const row = (overview.body.requests as Array<Record<string, unknown>>).find((r) => r.id === erasureId)!;
    expect(row.subjectName).toBe("Ayşe Silinsin");
    const days = (Date.parse(String(row.legalDueAt)) - Date.parse(String(row.createdAt))) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(row.overdue).toBe(false);
  });

  it("silme talebi elle 'tamamlandı' yapılamıyor", async () => {
    const res = await call("PATCH", `/v1/panel/kvkk/requests/${erasureId}`, {
      status: "fulfilled",
      responseNote: "Verileriniz silindi diye yanıtlandı",
    });
    expect(res.status).toBe(409);
  });

  it("kişi hâlâ üyeyse silme reddediliyor", async () => {
    const res = await call("POST", `/v1/panel/kvkk/requests/${erasureId}/erase`, {
      responseNote: "Silme talebi uygulandı, mali kayıtlar saklanıyor.",
    });
    expect(res.status).toBe(409);
  });

  it("sakin yönetici ucundan başvuru açamıyor", async () => {
    const res = await call(
      "POST",
      "/v1/panel/kvkk/requests",
      { type: "access", userId: MANAGER, detail: "Başkası adına başvuru denemesi" },
      residentCookie,
    );
    expect(res.status).toBe(403);
  });

  it("sakin kendi başvurusunu açıyor; aynı türde ikincisi reddediliyor", async () => {
    const first = await call("POST", "/v1/panel/kvkk/my-requests", { type: "access", detail: "Hangi verilerim işleniyor?" }, residentCookie);
    expect(first.status).toBe(201);
    const second = await call("POST", "/v1/panel/kvkk/my-requests", { type: "access", detail: "Tekrar soruyorum" }, residentCookie);
    expect(second.status).toBe(409);
    const mine = await call("GET", "/v1/panel/kvkk/my-requests", undefined, residentCookie);
    expect((mine.body.rows as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("üyelik kapandıktan sonra silme kimliği anonimleştiriyor", async () => {
    await withBypassRls("test:kvkk-remove", async (tx) => {
      await tx.update(memberships).set({ deletedAt: new Date() }).where(eq(memberships.userId, RESIDENT));
    });
    const res = await call("POST", `/v1/panel/kvkk/requests/${erasureId}/erase`, {
      responseNote: "Silme talebi uygulandı, mali kayıtlar saklanıyor.",
    });
    expect(res.status).toBe(201);

    const state = await withBypassRls("test:kvkk-check", async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, RESIDENT));
      const [request] = await tx.select().from(kvkkRequests).where(eq(kvkkRequests.id, erasureId));
      const live = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, RESIDENT));
      return { user, request, live };
    });
    expect(state.user).toMatchObject({ firstName: "Anonim", email: null, phone: null, bloodType: null });
    expect(state.user?.anonymizedAt).not.toBeNull();
    expect(state.request).toMatchObject({ status: "fulfilled" });
    expect(state.live).toHaveLength(0);
  });

  it("ihlal kaydı: 72 saat geçmiş ve Kurul'a bildirilmemişse gecikmiş", async () => {
    const created = await call("POST", "/v1/panel/kvkk/breaches", {
      title: "Kayıp dizüstü bilgisayar",
      description: "Yönetim ofisindeki şifresiz dizüstü bilgisayar kayboldu.",
      detectedAt: new Date(Date.now() - 80 * 3_600_000).toISOString(),
      affectedUserCount: 24,
      dataCategories: ["iletişim"],
    });
    expect(created.status).toBe(201);
    const list = await call("GET", "/v1/panel/kvkk/breaches");
    const row = (list.body.rows as Array<Record<string, unknown>>).find((r) => r.id === created.body.id)!;
    expect(row.boardOverdue).toBe(true);

    const notified = await call("PATCH", `/v1/panel/kvkk/breaches/${String(created.body.id)}`, {
      boardNotifiedAt: new Date().toISOString(),
      status: "contained",
    });
    expect(notified.status).toBe(200);
    const after = await call("GET", "/v1/panel/kvkk/breaches");
    const row2 = (after.body.rows as Array<Record<string, unknown>>).find((r) => r.id === created.body.id)!;
    expect(row2.boardOverdue).toBe(false);
  });
});
