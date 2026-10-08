import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Borç raporları: daire/üye × ay matrisi (kalan/tahakkuk/ödenen, dönem/vade
 * esası, kapsam), toplu borç dökümü, makbuz dökümü. Site: daire 1 = malik +
 * kiracı, daire 2 = malik.
 */
let site: TestSite;
type M = { rows: { key: string; label: string; sub: string | null; beforeMinor: number; months: number[]; afterMinor: number; totalMinor: number }[]; totals: { totalMinor: number; months: number[] } };

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("borc-rapor", 2);
  const mk = (unitId: string, shareTarget: string, period: string, dueDate: string, amountMinor: number) =>
    site.call("POST", "/v1/panel/debts", { unitId, kind: "dues", description: `Aidat ${period}`, amountMinor, period, dueDate, shareTarget });
  await mk(site.unitIds[0]!, "tenant", "2025-12", "2025-12-10T09:00:00.000Z", 1_000);
  await mk(site.unitIds[0]!, "tenant", "2026-01", "2026-02-10T09:00:00.000Z", 1_000); // dönemi Ocak, vadesi Şubat
  await mk(site.unitIds[1]!, "owner", "2026-03", "2026-03-10T09:00:00.000Z", 2_000);
  // Daire 2: 1.500 tahsilat (makbuz 77)
  const pay = await site.call("POST", "/v1/panel/debts/collect", {
    unitId: site.unitIds[1], amountMinor: 1_500, method: "cash", paidAt: "2026-03-15T10:00:00.000Z", receiptNo: "77",
  });
  expect(pay.status).toBe(201);
});

afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const matrix = async (qs: string) => {
  const res = await site.call("GET", `/v1/panel/reports/debts/matrix?year=2026&${qs}`);
  expect(res.status).toBe(200);
  return res.body as unknown as M;
};

describe.skipIf(!apiReachable)("borç raporları", () => {
  it("daire × ay kalan: devreden sütunu, dönem esası", async () => {
    const m = await matrix("rows=unit&value=remaining&basis=period");
    const u1 = m.rows.find((r) => r.key === site.unitIds[0])!;
    const u2 = m.rows.find((r) => r.key === site.unitIds[1])!;
    expect(u1.beforeMinor).toBe(1_000);
    expect(u1.months[0]).toBe(1_000);
    expect(u1.totalMinor).toBe(2_000);
    expect(u2.months[2]).toBe(500);
    expect(m.totals.totalMinor).toBe(2_500);
  });

  it("vade esası Ocak dönemli borcu Şubat'a koyar; ödenen ve tahakkuk", async () => {
    const due = await matrix("rows=unit&value=remaining&basis=due");
    expect(due.rows.find((r) => r.key === site.unitIds[0])!.months[1]).toBe(1_000);
    const paid = await matrix("rows=unit&value=paid");
    expect(paid.rows.map((r) => r.key)).toEqual([site.unitIds[1]]);
    expect(paid.rows[0]!.months[2]).toBe(1_500);
    const charged = await matrix("rows=unit&value=charged");
    expect(charged.totals.totalMinor).toBe(4_000);
  });

  it("üye satırları ve kapsam: kiracı satırı kiracının adıyla", async () => {
    const m = await matrix("rows=member&value=remaining&member=tenant");
    expect(m.rows.map((r) => r.key)).toEqual([site.tenantResidentId]);
    expect(m.rows[0]!.label).toContain("Kiracı");
    expect(m.rows[0]!.sub).toContain("Kiracı");
    expect((await site.call("GET", "/v1/panel/reports/debts/matrix?year=1800")).status).toBe(422);
  });

  it("toplu borç dökümü: daire başına açık kalemler", async () => {
    const res = await site.call("GET", "/v1/panel/reports/debts/open-items");
    const body = res.body as unknown as { units: { unitId: string; items: { remainingMinor: number }[]; totalMinor: number }[]; totalMinor: number };
    expect(body.units.map((u) => u.unitId)).toEqual(site.unitIds);
    expect(body.units[0]!.items).toHaveLength(2);
    expect(body.units[1]!.totalMinor).toBe(500);
    expect(body.totalMinor).toBe(2_500);
    const scoped = await site.call("GET", "/v1/panel/reports/debts/open-items?member=owner");
    expect((scoped.body.units as { unitId: string }[]).map((u) => u.unitId)).toEqual([site.unitIds[1]]);
  });

  it("makbuz dökümü: aralıktaki tahsilat ve mahsup satırları", async () => {
    const res = await site.call("GET", "/v1/panel/reports/debts/receipts?from=2026-03-01&to=2026-03-31");
    const rows = res.body.rows as { receiptNo: string; amountMinor: number; allocations: { description: string; amountMinor: number }[] }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.receiptNo).toBe("77");
    expect(rows[0]!.allocations).toEqual([{ description: "Aidat 2026-03", amountMinor: 1_500 }]);
    const empty = await site.call("GET", "/v1/panel/reports/debts/receipts?from=2026-04-01&to=2026-04-30");
    expect(empty.body.rows).toEqual([]);
    expect((await site.call("GET", "/v1/panel/reports/debts/receipts?from=2026-05-01&to=2026-04-01")).status).toBe(400);
  });
});
