import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, debts, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y7: önizlemede satır düzeltme, ileri tarihli borçlandırma, okuma bedeli, firma dosyası. */
let site: TestSite;
const base = { description: "Y7 aidat", kind: "dues", period: "2027-01", dueDay: 5, formula: "equal", amountMinor: 10_000, shareTarget: "owner", blockIds: [], unitTypes: [], skipExisting: true, lateFeeExempt: true };
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y7", 3);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});
const debtsOf = (period?: string) =>
  withBypassRls("t", (tx) => tx.select().from(debts).where(and(eq(debts.tenantId, site.tenantId), ...(period ? [eq(debts.period, period)] : []))));

describe.skipIf(!apiReachable)("Y7 borçlandırma", () => {
  it("önizleme: satır tutarı, hariç tut, borçlu adları; ileri tarihli toplam", async () => {
    const [u1, u2, u3] = site.unitIds as [string, string, string];
    const overrides = [{ unitId: u1, amountMinor: 15_000 }, { unitId: u2, excluded: true }];
    const p = await site.call("POST", "/v1/panel/debts/bulk/preview", { ...base, untilPeriod: "2027-03", overrides });
    expect(p.status).toBe(201);
    const rows = p.body.rows as { unitId: string; amountMinor: number; formulaMinor: number; excluded: boolean; debtorNames: string[]; hasTenant: boolean }[];
    expect(rows.find((r) => r.unitId === u1)).toMatchObject({ amountMinor: 15_000, formulaMinor: 10_000 });
    expect(rows.find((r) => r.unitId === u2)!.excluded).toBe(true);
    expect(rows.find((r) => r.unitId === u3)!.debtorNames.length).toBe(1);
    expect(p.body.periods).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(p.body.totalMinor).toBe((15_000 + 10_000) * 3);
  });

  it("yazma: 3 ay × 2 daire, düzeltilmiş tutar; tekrar → atlanır", async () => {
    const [u1, u2] = site.unitIds as [string, string];
    const overrides = [{ unitId: u1, amountMinor: 15_000 }, { unitId: u2, excluded: true }];
    const r = await site.call("POST", "/v1/panel/debts/bulk", { ...base, untilPeriod: "2027-03", overrides });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ createdCount: 6, totalMinor: 75_000 });
    const feb = await debtsOf("2027-02");
    expect(feb.map((d) => d.amountKurus).sort()).toEqual([10_000, 15_000]);
    expect(new Date(feb[0]!.dueDate).toISOString().slice(0, 7)).toBe("2027-02");
    const again = await site.call("POST", "/v1/panel/debts/bulk", { ...base, untilPeriod: "2027-03", overrides });
    expect(again.status).toBe(400); // hepsi zaten var → nothing_to_create
    expect((await site.call("POST", "/v1/panel/debts/bulk/preview", { ...base, untilPeriod: "2029-12" })).status).toBe(400);
  });

  it("satırda borçlu: kiracı yoksa önizleme hatayı satırda gösterir", async () => {
    const p = await site.call("POST", "/v1/panel/debts/bulk/preview", { ...base, period: "2027-06", overrides: site.unitIds.map((unitId) => ({ unitId, target: "tenant" })) });
    const rows = p.body.rows as { debtorError: string | null; hasTenant: boolean }[];
    expect(rows.filter((r) => r.hasTenant).every((r) => r.debtorError === null)).toBe(true);
    expect(rows.filter((r) => !r.hasTenant).every((r) => r.debtorError !== null)).toBe(true);
  });

  it("sayaç: okuma bedeli + yuvarlama; firma dosyası eşleşmesi", async () => {
    const m = await site.call("POST", "/v1/panel/operations/meters", { unitId: site.unitIds[0], type: "water", serialNo: "SU-77", unitPriceMinor: 1_333, initialValue: 100 });
    expect(m.status).toBe(201);
    await site.call("POST", "/v1/panel/operations/meters/readings", { period: "2027-01", readingDate: "2027-01-31T09:00:00.000Z", entries: [{ meterId: m.body.id, currentValue: 110 }] });
    const bill = await site.call("POST", "/v1/panel/operations/meters/readings/bill", { period: "2027-01", dueDate: "2027-02-10T20:59:00.000Z", readingFeeMinor: 750, roundLira: true });
    expect(bill.body).toMatchObject({ billed: 1, totalMinor: 14_100 }); // 133,30 + 7,50 = 140,80 → 141
    const csv = "Daire;Sayaç No;Tüketim;Ödenecek Tutar\nA1;su 77;12;245,50\nX;YOK-1;3;10\n";
    const body = { period: "2027-02", fileBase64: Buffer.from(csv).toString("base64"), readingFeeMinor: 500, dueDate: "2027-03-10T20:59:00.000Z" };
    const pv = await site.call("POST", "/v1/panel/operations/meters/vendor-import/preview", body);
    expect(pv.status).toBe(201);
    expect((pv.body.rows as { status: string }[]).map((r) => r.status)).toEqual(["ok", "unmatched"]);
    expect(pv.body.totalMinor).toBe(25_050);
    const go = await site.call("POST", "/v1/panel/operations/meters/vendor-import", body);
    expect(go.body.created).toBe(1);
    const again = await site.call("POST", "/v1/panel/operations/meters/vendor-import/preview", body);
    expect((again.body.rows as { status: string }[])[0]!.status).toBe("already");
    expect((await site.call("POST", "/v1/panel/operations/meters/vendor-import/preview", { ...body, fileBase64: Buffer.from("a;b\n1;2").toString("base64") })).body.missing).toEqual(["serial", "amount"]);
  });
});
