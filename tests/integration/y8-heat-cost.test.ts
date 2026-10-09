import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { closeDb, debts, meterReadings, units, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y8: ısı pay ölçerli paylaşım — okumalardan önizleme, borçlandırma, kilit. */
let site: TestSite;
const period = "2027-01";
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y8", 3);
  await withBypassRls("t", (tx) => tx.update(units).set({ areaM2: "100" }).where(inArray(units.id, site.unitIds)));
  const heat: string[] = [];
  for (const [i, unitId] of site.unitIds.entries()) {
    const m = await site.call("POST", "/v1/panel/operations/meters", { unitId, type: "heat_calorimeter", serialNo: `ISI-${i}`, initialValue: 0 });
    heat.push(m.body.id as string);
    const w = await site.call("POST", "/v1/panel/operations/meters", { unitId, type: "hot_water", serialNo: `SS-${i}`, initialValue: 0 });
    heat.push(w.body.id as string);
  }
  // ısı: 600, 400, 0 (okunamayan); sıcak su: 3, 1, 0
  const entries = [600, 3, 400, 1, 0, 0].map((currentValue, i) => ({ meterId: heat[i]!, currentValue }));
  const r = await site.call("POST", "/v1/panel/operations/meters/readings", { period, readingDate: "2027-01-31T09:00:00.000Z", entries });
  expect(r.status).toBe(201);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const req = { period, mode: "heat", invoiceMinor: 1_000_000, commonPct: 30, minConsumptionPct: 40, readingFeeMinor: 500, rounding: "lira" };

describe.skipIf(!apiReachable)("ısı pay ölçerli paylaşım", () => {
  it("önizleme: okumalardan tüketim, asgari tüketim, okuma bedeli", async () => {
    const p = await site.call("POST", "/v1/panel/operations/meters/heat-cost/preview", req);
    expect(p.status).toBe(201);
    const rows = p.body.rows as { heatConsumption: number; minApplied: boolean; totalMinor: number; readingFeeMinor: number }[];
    expect(rows.map((r) => r.heatConsumption)).toEqual([600, 400, 0]);
    expect(rows[2]!.minApplied).toBe(true);
    expect(rows.every((r) => r.totalMinor % 100 === 0 && r.readingFeeMinor === 500)).toBe(true);
    expect(p.body.error).toBeNull();
    const total = (p.body.totals as { totalMinor: number }).totalMinor;
    expect(total).toBeGreaterThanOrEqual(1_000_000 + 1_500);
    expect(total).toBeLessThan(1_000_000 + 1_500 + 400);
  });

  it("yakıt + su ve hata kodları", async () => {
    const p = await site.call("POST", "/v1/panel/operations/meters/heat-cost/preview", {
      ...req, mode: "heat_water", water: { coldWaterPriceMinor: 2_000, inletTemp: 10, outletTemp: 55, lowerHeatingValue: 8_250, gasConsumptionM3: 1_000 },
    });
    expect((p.body.totals as { waterHeatingMinor: number }).waterHeatingMinor).toBe(26_182);
    const bad = await site.call("POST", "/v1/panel/operations/meters/heat-cost/preview", { ...req, mode: "heat_water" });
    expect(bad.body.error).toBe("water_params");
  });

  it("borçlandır → okumalar kilitlenir, ikinci kez 409", async () => {
    const r = await site.call("POST", "/v1/panel/operations/meters/heat-cost", { ...req, dueDate: "2027-02-15T20:59:00.000Z" });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(3);
    const rows = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.tenantId, site.tenantId)));
    expect(rows.every((d) => d.kind === "utility" && d.period === period)).toBe(true);
    expect((rows[0]!.metadata as { heatCost?: unknown }).heatCost).toBeTruthy();
    const readings = await withBypassRls("t", (tx) => tx.select().from(meterReadings).where(eq(meterReadings.tenantId, site.tenantId)));
    expect(readings.every((x) => x.debtId !== null)).toBe(true);
    const again = await site.call("POST", "/v1/panel/operations/meters/heat-cost", { ...req, dueDate: "2027-02-15T20:59:00.000Z" });
    expect(again.status).toBe(409);
    expect((await site.call("POST", "/v1/panel/operations/meters/heat-cost/preview", req)).body.alreadyBilled).toBe(true);
  });
});
