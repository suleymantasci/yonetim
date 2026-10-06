import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  closeDb,
  maintenanceLogs,
  maintenanceRecords,
  memberships,
  sessions,
  tenants,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Bakım geçmişi — "yapıldı" her seferinde ayrı satır bırakıyor.
 * Önceden tamamlama `last_done_at` üstüne yazıyordu; ikinci bakım birincisini
 * siliyordu ve geçmiş hiçbir yerde listelenmiyordu.
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const TENANT = { id: randomUUID(), slug: `bakim-${Date.now()}` };
const MANAGER = randomUUID();
let cookie = "";

const apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;
  await withBypassRls("test:mnt-setup", async (tx) => {
    await tx.insert(tenants).values({ id: TENANT.id, slug: TENANT.slug, name: "Bakım Testi", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values({ id: MANAGER, firstName: "Yönetici", lastName: "Bakım", phone: `+9055508${String(Date.now()).slice(-5)}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: TENANT.id, userId: MANAGER, role: "manager", acceptedAt: new Date() });
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: TENANT.id })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:mnt-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(maintenanceLogs).where(eq(maintenanceLogs.tenantId, TENANT.id));
      await tx.delete(maintenanceRecords).where(eq(maintenanceRecords.tenantId, TENANT.id));
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

describe.skipIf(!apiReachable)("bakım geçmişi", () => {
  it("her tamamlama geçmişe satır ekliyor; detay ve liste geçmişi döndürüyor", async () => {
    const created = await call("POST", "/v1/panel/operations/maintenance", {
      equipmentType: "elevator",
      label: "Asansör aylık bakım",
      intervalDays: 30,
      nextDueAt: "2026-10-01T00:00:00.000Z",
      isActive: true,
    });
    expect(created.status).toBe(201);
    const id = String(created.body.id);

    expect((await call("POST", `/v1/panel/operations/maintenance/${id}/complete`, { doneAt: "2026-09-01T00:00:00.000Z", costMinor: 150000, note: "Halat kontrol edildi" })).status).toBe(201);
    expect((await call("POST", `/v1/panel/operations/maintenance/${id}/complete`, { doneAt: "2026-10-01T00:00:00.000Z", costMinor: 160000, documentUrl: "https://ornek.test/rapor.pdf" })).status).toBe(201);

    const detail = await call("GET", `/v1/panel/operations/maintenance/${id}`);
    const history = detail.body.history as { doneAt: string; costMinor: number; note: string | null; createdByName: string | null }[];
    expect(history).toHaveLength(2);
    // Yeniden eskiye; ilk bakım ikinci tamamlamada ezilmemiş.
    expect(history[0]!.costMinor).toBe(160000);
    expect(history[1]!.costMinor).toBe(150000);
    expect(history[1]!.note).toBe("Halat kontrol edildi");
    expect(history[0]!.createdByName).toBe("Yönetici Bakım");

    const list = await call("GET", "/v1/panel/operations/maintenance");
    expect((list.body.recentLogs as unknown[]).length).toBe(2);

    // Tamamlama notu artık plan notlarına eklenmiyor.
    const [row] = await withBypassRls("test:mnt-read", (tx) => tx.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, id)));
    expect(row?.notes).toBeNull();
  });
});
