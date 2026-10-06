import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import {
  blocks, closeDb, debts, memberships, sessions, tenants, units, users, withBypassRls,
} from "@yonetim/db";

/** Borç silme/affetme: yetki, karar referansı, kalan tutar, raporlardan düşme. */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const T = randomUUID();
const MANAGER = randomUUID();
const OWNER = randomUUID();
const DAY = 86_400_000;
let managerCookie = "";
let ownerCookie = "";
let apiReachable = false;
let unitId = "";
const D = { partial: randomUUID(), paid: randomUUID(), open: randomUUID() };

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!apiReachable) return;
  const s = String(Date.now()).slice(-5);
  await withBypassRls("test:forgive-setup", async (tx) => {
    await tx.insert(tenants).values({ id: T, slug: `affet-${s}`, name: "Af Testi", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Y", lastName: "Af", phone: `+9055518${s}`, locale: "tr" },
      { id: OWNER, firstName: "M", lastName: "Af", phone: `+9055519${s}`, locale: "tr" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: T, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: T, userId: OWNER, role: "owner", acceptedAt: new Date() },
    ]);
    const [b] = await tx.insert(blocks).values({ tenantId: T, name: "A", floorCount: 1, unitCount: 1 }).returning({ id: blocks.id });
    const [u] = await tx.insert(units).values({ tenantId: T, blockId: b!.id, number: "1", floor: 1, type: "flat", areaM2: "80", landShare: "1" }).returning({ id: units.id });
    unitId = u!.id;
    const due = new Date(Date.now() - 30 * DAY);
    await tx.insert(debts).values([
      { id: D.partial, tenantId: T, unitId, debtorUserId: OWNER, description: "Kısmi", amountKurus: 100_000, paidKurus: 40_000, status: "partial", dueDate: due },
      { id: D.paid, tenantId: T, unitId, debtorUserId: OWNER, description: "Ödenmiş", amountKurus: 50_000, paidKurus: 50_000, status: "paid", dueDate: due },
      { id: D.open, tenantId: T, unitId, debtorUserId: OWNER, description: "Açık", amountKurus: 25_000, status: "overdue", dueDate: due },
    ]);
  });
  managerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: T })).token}`;
  ownerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: OWNER, tenantId: T })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:forgive-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(sessions).where(eq(sessions.userId, OWNER));
      await tx.delete(debts).where(eq(debts.tenantId, T));
      await tx.delete(units).where(eq(units.tenantId, T));
      await tx.delete(blocks).where(eq(blocks.tenantId, T));
      await tx.delete(memberships).where(eq(memberships.tenantId, T));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(users).where(eq(users.id, OWNER));
      await tx.delete(tenants).where(eq(tenants.id, T));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, cookie: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

const forgive = (cookie: string, ids: string[], extra: Record<string, unknown> = {}) =>
  call("POST", "/v1/panel/debts/forgive", cookie, { ids, reason: "Kurul kararıyla silinmiştir", decisionRef: "2026/14 sayılı karar", ...extra });

const outstanding = async () => {
  const res = await call("GET", "/v1/panel/portfolio", managerCookie);
  return (res.body.rows as Array<{ tenantId: string; outstandingMinor: number }>).find((r) => r.tenantId === T)!.outstandingMinor;
};

describe.skipIf(!process.env.INTEGRATION)("borç silme / affetme", () => {
  it("malik (debt:forgive yok) silemez", async () => {
    if (!apiReachable) return;
    expect((await forgive(ownerCookie, [D.open])).status).toBe(403);
  });

  it("karar referansı ve gerekçe zorunlu", async () => {
    if (!apiReachable) return;
    expect((await forgive(managerCookie, [D.open], { decisionRef: "" })).status).toBe(422);
    expect((await forgive(managerCookie, [D.open], { reason: "kısa" })).status).toBe(422);
  });

  it("açık ve kısmi borç silinir; ödenmiş etkilenmez; raporlardan düşer", async () => {
    if (!apiReachable) return;
    expect(await outstanding()).toBe(60_000 + 25_000); // kısmi kalan + açık
    const res = await forgive(managerCookie, [D.partial, D.paid, D.open]);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ affected: 2, requested: 3 });

    const rows = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.tenantId, T)));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[D.partial]).toMatchObject({ status: "written_off", paidKurus: 40_000, lateFeeExempt: true });
    expect((byId[D.partial]!.metadata as any).forgiven).toMatchObject({ amountKurus: 60_000, decisionRef: "2026/14 sayılı karar" });
    expect(byId[D.paid]!.status).toBe("paid");

    expect(await outstanding()).toBe(0);
  });

  it("zaten silinmiş borç ikinci kez işlenmez", async () => {
    if (!apiReachable) return;
    expect((await forgive(managerCookie, [D.partial])).body).toMatchObject({ affected: 0, requested: 1 });
  });
});
