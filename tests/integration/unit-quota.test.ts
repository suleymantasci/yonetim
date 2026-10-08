import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  closeDb,
  invoices,
  plans,
  sessions,
  subscriptions,
  tenants,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

import { apiReachable, BASE, createSite, type TestSite } from "./_site";

/**
 * Paket daire sınırı (`assertUnitQuota`): demo ve süresi dolmamış denemede
 * sınır yok; deneme bitince paket yoksa ekleme yok, paket varsa `max_units`.
 * Tekli/toplu ekleme ve geri yükleme aynı kapıdan geçiyor; süper admin
 * daire sayısından küçük paket atayamıyor.
 */
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const SUPER = randomUUID();
let site: TestSite;
let superCookie = "";
let smallPlan: { id: string; maxUnits: number };
let n = 100;

const hint = (body: Record<string, unknown>) =>
  ((body.error as { details?: { hint?: string } } | undefined)?.details?.hint) ?? null;
const addOne = () => site.call("POST", "/v1/panel/units", { number: `Q${n++}`, floor: 1 });
const setTenant = (patch: Partial<typeof tenants.$inferInsert>) =>
  withBypassRls("test:quota-tenant", (tx) => tx.update(tenants).set(patch).where(eq(tenants.id, site.tenantId)));
const liveUnits = () =>
  withBypassRls("test:quota-count", async (tx) =>
    (await tx.select({ id: units.id }).from(units).where(and(eq(units.tenantId, site.tenantId), isNull(units.deletedAt)))).length,
  );

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("kota", 3);
  await withBypassRls("test:quota-setup", async (tx) => {
    const [plan] = await tx.select({ id: plans.id, maxUnits: plans.maxUnits }).from(plans).where(eq(plans.code, "standart-1"));
    smallPlan = { id: plan!.id, maxUnits: plan!.maxUnits! };
    await tx.insert(users).values({
      id: SUPER, firstName: "Süper", lastName: "Kota", email: `super-q-${Date.now()}@ornek.test`,
      locale: "tr", platformRole: "super_admin",
    });
  });
  superCookie = `${SESSION_COOKIE}=${(await createSession({ userId: SUPER })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:quota-cleanup", async (tx) => {
      await tx.delete(invoices).where(eq(invoices.tenantId, site.tenantId));
      await tx.delete(subscriptions).where(eq(subscriptions.tenantId, site.tenantId));
      await tx.delete(sessions).where(inArray(sessions.userId, [SUPER]));
      await tx.delete(users).where(eq(users.id, SUPER));
    });
    await site.cleanup();
  }
  await closeDb();
});

describe.skipIf(!apiReachable)("paket daire sınırı", () => {
  it("deneme sürerken sınır yok", async () => {
    await setTenant({ status: "trial", trialEndsAt: new Date(Date.now() + 86_400_000) });
    const r = await addOne();
    expect(r.status).toBe(201);
  });

  // Durum hep yazmaya açık kalıyor (trial/active): `suspended` site zaten
  // `TenantWritableGuard`'da salt-okunur, ve guard'ın gördüğü durum Redis'te
  // 60 sn önbellekli — testin sonucu önbelleğin olup olmamasına bağlı kalmasın.
  it("deneme bitti, paket yok: ekleme reddedilir (iş kuyruğu çalışmamış olsa da)", async () => {
    await setTenant({ status: "trial", trialEndsAt: new Date(Date.now() - 60_000) });
    const r = await addOne();
    expect(r.status).toBe(409);
    expect(hint(r.body)).toBe("conflict:unit_limit_no_plan");
  });

  it("demo hesap: deneme bitmiş olsa da sınır yok", async () => {
    await setTenant({ isDemo: true });
    try {
      expect((await addOne()).status).toBe(201);
    } finally {
      await setTenant({ isDemo: false });
    }
  });

  it("süper admin daire sayısından küçük paket atayamaz", async () => {
    // Sınırın bir fazlası daire olsun.
    await withBypassRls("test:quota-fill", async (tx) => {
      const have = (await tx.select({ id: units.id }).from(units).where(and(eq(units.tenantId, site.tenantId), isNull(units.deletedAt)))).length;
      const extra = smallPlan.maxUnits + 1 - have;
      if (extra > 0)
        await tx.insert(units).values(
          Array.from({ length: extra }, (_, i) => ({ tenantId: site.tenantId, number: `F${i}`, floor: 0 })),
        );
    });
    const assign = (cookie = superCookie) =>
      fetch(`${BASE}/v1/panel/platform/subscriptions/assign`, {
        method: "POST",
        headers: { cookie, origin: PANEL_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({
          tenantId: site.tenantId, planId: smallPlan.id, period: "yearly", periodCount: 1,
          discount: { kind: "none" }, startsAt: new Date().toISOString(), markPaid: true,
        }),
      }).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
    const r = await assign();
    expect(r.status).toBe(409);
    expect(hint(r.body)).toBe("conflict:plan_below_unit_count");

    // Fazlalık silinince aynı paket atanabiliyor.
    await withBypassRls("test:quota-trim", (tx) =>
      tx.delete(units).where(and(eq(units.tenantId, site.tenantId), eq(units.number, "F0"))),
    );
    expect(await liveUnits()).toBe(smallPlan.maxUnits);
    const ok = await assign();
    expect(ok.status).toBe(201);
  });

  it("paket dolu: tekli ve toplu ekleme reddedilir", async () => {
    const one = await addOne();
    expect(one.status).toBe(409);
    expect(hint(one.body)).toBe("conflict:unit_limit");

    const bulk = await site.call("POST", "/v1/panel/units/bulk", {
      newBlockName: "Kota", floorFrom: 1, floorTo: 1, perFloor: 2, pattern: "{no}",
      numbering: "sequential", confirmed: true,
    });
    expect(bulk.status).toBe(409);
    expect(hint(bulk.body)).toBe("conflict:unit_limit");
    expect(await liveUnits()).toBe(smallPlan.maxUnits);
  });

  it("çöpe atılan yerine yenisi eklenince geri yükleme sınırı aşamaz", async () => {
    const [victim] = site.unitIds;
    expect((await site.call("POST", "/v1/panel/units/trash", { ids: [victim] })).status).toBeLessThan(300);
    expect((await addOne()).status).toBe(201);
    const restore = await site.call("POST", "/v1/panel/units/restore", { ids: [victim] });
    expect(restore.status).toBe(409);
    expect(hint(restore.body)).toBe("conflict:unit_limit");
    expect(await liveUnits()).toBe(smallPlan.maxUnits);
  });
});
