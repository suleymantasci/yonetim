import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, debts, withBypassRls } from "@yonetim/db";
import { applyLateFees } from "@yonetim/jobs";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Y5 dönem kilidi: kilitli tarihe yeni kayıt / tutar değişikliği / iptal
 * yok; sonraki tahsilatın eski borcu kapatması ve gecikme işi serbest.
 */
let site: TestSite;
let oldDebt = "";
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y5", 1);
  const d = await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Eski aidat", amountMinor: 10_000, dueDate: "2026-03-10T09:00:00.000Z", shareTarget: "owner" });
  oldDebt = (d.body.ids as string[])[0]!;
  await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 1_000, method: "cash", paidAt: "2026-03-15T10:00:00.000Z" });
  expect((await site.call("POST", "/v1/panel/cash/lock", { until: "2026-06-30", reason: "Genel kurul ibrası" })).status).toBe(201);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup(); // kilitliyken site silinebilmeli (cascade)
  await closeDb();
});

describe.skipIf(!apiReachable)("dönem kilidi", () => {
  it("kilitli tarihe yeni borç, tahsilat, gider, kasa hareketi girilemez", async () => {
    const debt = await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Geç girilen", amountMinor: 500, dueDate: "2026-05-10T09:00:00.000Z", shareTarget: "owner" });
    expect(debt.status).toBe(409);
    expect((debt.body.error as { details: { hint: string } }).details.hint).toBe("conflict:period_locked");
    expect((await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 100, method: "cash", paidAt: "2026-06-01T10:00:00.000Z" })).status).toBe(409);
    expect((await site.call("POST", "/v1/panel/cash/incomes", { date: "2026-06-01", amountMinor: 100, to: { account: "cash" }, category: "other", payerName: "X Y" })).status).toBe(409);
    expect((await site.call("POST", "/v1/panel/expenses", { description: "Eski fatura", amountMinor: 100, vatRate: 0.2, expenseDate: "2026-04-01", status: "approved" })).status).toBe(409);
  });

  it("kilitli borç iptal edilemez / düzeltilemez", async () => {
    const cancel = await site.call("POST", "/v1/panel/debts/cancel", { ids: [oldDebt], reason: "Yanlış giriş deneme" });
    // Kısmen ödenmiş borç zaten iptal edilemez; kilit de engellemeli: borç duruyor.
    expect([201, 409]).toContain(cancel.status);
    const [row] = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.id, oldDebt)));
    expect(row!.deletedAt).toBeNull();
    const adj = await site.call("PATCH", `/v1/panel/debts/${oldDebt}`, {
      amountMinor: 20_000, dueDate: "2026-03-10T09:00:00.000Z", reason: "Tutar düzeltme denemesi",
    });
    expect(adj.status).toBe(409);
  });

  it("sonraki tahsilat eski borcu kapatır; gecikme işi çalışır", async () => {
    const pay = await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 9_000, method: "cash", paidAt: new Date().toISOString() });
    expect(pay.status).toBe(201);
    const [row] = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.id, oldDebt)));
    expect(row!.paidKurus).toBe(10_000);
    await expect(applyLateFees({ tenantId: site.tenantId })).resolves.toBeTruthy();
  });

  it("kilit kaldırılınca giriş serbest; kilit yönetici yetkisi", async () => {
    expect((await site.call("POST", "/v1/panel/cash/lock", { until: null, reason: "Düzeltme için açıldı" }, site.ownerCookie)).status).toBe(403);
    expect((await site.call("POST", "/v1/panel/cash/lock", { until: null, reason: "Düzeltme için açıldı" })).status).toBe(201);
    expect((await site.call("GET", "/v1/panel/cash/lock")).body.until).toBeNull();
    const debt = await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Geç girilen", amountMinor: 500, dueDate: "2026-05-10T09:00:00.000Z", shareTarget: "owner" });
    expect(debt.status).toBe(201);
    await site.call("POST", "/v1/panel/cash/lock", { until: "2026-06-30", reason: "Yeniden kilitlendi" });
  });

  it("talimat alıcıları", async () => {
    const v = await site.call("POST", "/v1/panel/vendors", { name: "Asansör Ltd", category: "Bakım", iban: "TR330006100519786457841326" });
    expect(v.status).toBe(201);
    const res = await site.call("GET", "/v1/panel/cash/payees");
    expect(res.status).toBe(200);
    expect(res.body.payees).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "vendor", name: "Asansör Ltd" })]));
  });
});
