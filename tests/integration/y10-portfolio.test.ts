import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb, memberships, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y10: portföy finans özeti ve tüm sitelerde kişi arama — yalnız yönetim rolündeki siteler. */
let a: TestSite;
let b: TestSite;
let c: TestSite;
beforeAll(async () => {
  if (!apiReachable) return;
  a = await createSite("y10a", 1);
  b = await createSite("y10b", 2);
  c = await createSite("y10c", 1);
  await withBypassRls("t", (tx) =>
    tx.insert(memberships).values([
      { tenantId: b.tenantId, userId: a.managerId, role: "manager", acceptedAt: new Date() },
      // c'de yalnız malik: kasası ve kişileri görünmemeli
      { tenantId: c.tenantId, userId: a.managerId, role: "owner", acceptedAt: new Date() },
    ]),
  );
  await b.call("POST", "/v1/panel/debts", { unitId: b.unitIds[0], kind: "dues", description: "B aidat", amountMinor: 5_000, dueDate: "2027-01-10T09:00:00.000Z", shareTarget: "owner" });
  await b.call("POST", "/v1/panel/debts/collect", { unitId: b.unitIds[0], amountMinor: 2_000, method: "cash", paidAt: new Date().toISOString() });
  await b.call("POST", "/v1/panel/expenses", { description: "B fatura", amountMinor: 700, vatRate: 0.2, expenseDate: new Date().toISOString(), status: "approved" });
});
afterAll(async () => {
  if (apiReachable) for (const s of [a, b, c]) await s.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("Y10 çok site", () => {
  it("finans özeti: yönetilen iki site, malik olunan site yok", async () => {
    const r = await a.call("GET", "/v1/panel/portfolio/finance");
    expect(r.status).toBe(200);
    const rows = r.body.rows as { tenantId: string; cashMinor: number; receivableMinor: number; payableMinor: number }[];
    expect(rows.map((x) => x.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort());
    expect(rows.find((x) => x.tenantId === b.tenantId)).toMatchObject({ cashMinor: 2_000, receivableMinor: 3_000, payableMinor: 700 });
  });

  it("kişi arama: iki sitede de, maskeli telefon; malik olunan site hariç", async () => {
    const r = await a.call("GET", "/v1/panel/portfolio/people?q=Malik1");
    expect(r.status).toBe(200);
    const rows = r.body.rows as { tenantId: string; phone: string | null; units: string[]; outstandingMinor: number }[];
    const sites = new Set(rows.map((x) => x.tenantId));
    expect(sites.has(a.tenantId) && sites.has(b.tenantId)).toBe(true);
    expect(sites.has(c.tenantId)).toBe(false);
    expect(rows.every((x) => !x.phone || x.phone.includes("*"))).toBe(true);
    expect(rows.find((x) => x.tenantId === b.tenantId)!.outstandingMinor).toBe(3_000);
    expect((await a.call("GET", "/v1/panel/portfolio/people?q=x")).status).toBe(422);
    const owner = await b.call("GET", "/v1/panel/portfolio/people?q=Malik1", undefined, b.ownerCookie);
    expect((owner.body.rows as unknown[]).length).toBe(0);
  });
});
