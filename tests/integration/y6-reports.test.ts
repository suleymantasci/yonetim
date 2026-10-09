import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, memberships, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y6 raporları: tahsilat, gider + grup, kasa günlükleri, aylık, borçlandırma, kodlar, notlar. */
let site: TestSite;
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const period = today.slice(0, 7);
const DIST = "equal";
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y6", 2);
  await site.call("POST", "/v1/panel/debts/bulk", {
    kind: "dues", period, description: "Y6 aidat", amountMinor: 10_000, formula: "equal", dueDay: 1, shareTarget: "owner", blockIds: [], unitTypes: [], skipExisting: false, lateFeeExempt: true,
  });
  await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 7_500, method: "cash", paidAt: new Date().toISOString() });
  await site.call("POST", "/v1/panel/cash/incomes", { date: today, amountMinor: 3_000, to: { account: "cash" }, category: "rent", payerName: "Kafe Ltd", description: "Çatı kirası" });
  const cat = await site.call("POST", "/v1/panel/expenses/categories", { name: "Bakım onarım", distribution: DIST });
  await site.call("POST", "/v1/panel/expenses", { description: "Kazan bakımı", amountMinor: 4_000, vatRate: 0.2, expenseDate: today, status: "paid", isPaid: true, categoryId: cat.body.id });
  await site.call("POST", "/v1/panel/expenses", { description: "Elektrik", amountMinor: 1_000, vatRate: 0.2, expenseDate: today, status: "approved" });
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("Y6 raporları", () => {
  it("tahsilat raporu: üye + harici, tür ve arama süzgeci", async () => {
    const all = (await site.call("GET", `/v1/panel/reports/extra/collections?from=${today}&to=${today}`)).body as { rows: { kind: string }[]; totals: Record<string, number> };
    expect(all.totals).toMatchObject({ memberMinor: 7_500, externalMinor: 3_000, totalMinor: 10_500 });
    const ext = (await site.call("GET", `/v1/panel/reports/extra/collections?from=${today}&to=${today}&kind=external`)).body as { rows: unknown[] };
    expect(ext.rows).toHaveLength(1);
    const q = (await site.call("GET", `/v1/panel/reports/extra/collections?from=${today}&to=${today}&q=${encodeURIComponent("Y6 aidat")}`)).body as { rows: { kind: string }[] };
    expect(q.rows.map((r) => r.kind)).toEqual(["member"]);
    expect((await site.call("GET", `/v1/panel/reports/extra/collections?from=2026-12-01&to=2026-01-01`)).status).toBe(400);
  });

  it("gider raporu: grup toplamı ve ödenmiş süzgeci", async () => {
    const r = (await site.call("GET", `/v1/panel/reports/extra/expenses?from=${today}&to=${today}`)).body as { groups: { name: string | null; amountMinor: number; paidMinor: number }[]; totals: { amountMinor: number; paidMinor: number } };
    expect(r.totals).toEqual({ amountMinor: 5_000, paidMinor: 4_000 });
    expect(r.groups.find((g) => g.name === "Bakım onarım")).toMatchObject({ amountMinor: 4_000, paidMinor: 4_000 });
    const unpaid = (await site.call("GET", `/v1/panel/reports/extra/expenses?from=${today}&to=${today}&state=unpaid`)).body as { rows: { description: string }[] };
    expect(unpaid.rows.map((x) => x.description)).toEqual(["Elektrik"]);
  });

  it("günlük bilanço: kasa = tahsilat + harici − ödenen gider", async () => {
    const r = (await site.call("GET", `/v1/panel/reports/extra/cash-days?from=${today}&to=${today}`)).body as { openingMinor: number; days: { inMinor: number; outMinor: number; closingMinor: number }[] };
    expect(r.days[0]).toMatchObject({ inMinor: 10_500, outMinor: 4_000, closingMinor: r.openingMinor + 6_500 });
    expect((await site.call("GET", `/v1/panel/reports/extra/cash-days?from=2026-01-01&to=2026-12-31`)).status).toBe(400);
  });

  it("aylık bilanço: daire başı tahakkuk/tahsilat/kalan", async () => {
    const r = (await site.call("GET", `/v1/panel/reports/extra/monthly?period=${period}`)).body as { rows: { accruedMinor: number; collectedMinor: number; remainingMinor: number }[]; totals: Record<string, number> };
    expect(r.totals).toMatchObject({ accruedMinor: 20_000, collectedMinor: 7_500, externalMinor: 3_000, expenseMinor: 5_000 });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.reduce((a, x) => a + x.accruedMinor, 0)).toBe(20_000);
  });

  it("borçlandırma durum + detay", async () => {
    const runs = (await site.call("GET", `/v1/panel/reports/extra/debt-runs?period=${period}`)).body as { batches: { key: string; description: string; count: number; amountMinor: number; paidMinor: number; remainingMinor: number }[] };
    const b = runs.batches.find((x) => x.description === "Y6 aidat")!;
    expect(b).toMatchObject({ count: 2, amountMinor: 20_000, remainingMinor: 20_000 - b.paidMinor });
    expect(b.paidMinor).toBeGreaterThan(0);
    const detail = (await site.call("GET", `/v1/panel/reports/extra/debt-runs/detail?batch=${b.key}`)).body as { rows: unknown[]; totals: { amountMinor: number } };
    expect(detail.rows).toHaveLength(2);
    expect(detail.totals.amountMinor).toBe(20_000);
  });

  it("muhasebe kodları ve üye notları", async () => {
    const codes = (await site.call("GET", "/v1/panel/reports/extra/account-codes")).body as { accounts: { code: string; group: string }[] };
    expect(codes.accounts).toEqual(expect.arrayContaining([expect.objectContaining({ code: "100", group: "assets" }), expect.objectContaining({ code: "600", group: "income" })]));
    await withBypassRls("t", (tx) => tx.update(memberships).set({ notes: "Anahtar yönetimde" }).where(and(eq(memberships.tenantId, site.tenantId), eq(memberships.role, "owner"))));
    const notes = (await site.call("GET", "/v1/panel/reports/extra/member-notes?q=anahtar")).body as { rows: { note: string }[] };
    expect(notes.rows.length).toBeGreaterThan(0);
    expect(notes.rows[0]!.note).toBe("Anahtar yönetimde");
    expect((await site.call("GET", "/v1/panel/reports/extra/member-notes", undefined, site.ownerCookie)).status).toBe(403);
  });
});
