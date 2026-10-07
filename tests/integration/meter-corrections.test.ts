import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, debts, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Sayaç okuması düzeltme / silme / borçlandırma.
 * Düzeltme sonraki dönemi yeniden hesaplıyor; borçlandırılan okuma kilitli;
 * borç kiracıya (yoksa malike) yazılıyor.
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("sayac", 2);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("sayaç okuması", () => {
  it("düzelt, borçlandır, kilit, sil", async () => {
    const m1 = await site.call("POST", "/v1/panel/operations/meters", { unitId: site.unitIds[0], type: "water", unitPriceMinor: 2000, initialValue: 100 });
    const m2 = await site.call("POST", "/v1/panel/operations/meters", { unitId: site.unitIds[1], type: "water", unitPriceMinor: 2000, initialValue: 50 });
    expect(m1.status).toBe(201);
    const meter1 = String(m1.body.id);
    const meter2 = String(m2.body.id);

    for (const [period, v1, v2] of [["2026-08", 110, 55], ["2026-09", 125, 60]] as const) {
      const r = await site.call("POST", "/v1/panel/operations/meters/readings", {
        period, readingDate: `${period}-28T00:00:00.000Z`,
        entries: [{ meterId: meter1, currentValue: v1 }, { meterId: meter2, currentValue: v2 }],
      });
      expect(r.status).toBe(201);
    }

    const list = async () =>
      (await site.call("GET", "/v1/panel/operations/meters")).body.readings as {
        id: string; meterId: string; period: string; previousValue: string; consumption: string; amountMinor: number; billed: boolean;
      }[];
    const find = (rows: Awaited<ReturnType<typeof list>>, meter: string, period: string) =>
      rows.find((r) => r.meterId === meter && r.period === period)!;

    let rows = await list();
    const aug1 = find(rows, meter1, "2026-08");

    // Gerekçesiz düzeltme reddedilir.
    expect((await site.call("PATCH", `/v1/panel/operations/meters/readings/${aug1.id}`, { currentValue: 112, reason: "kısa" })).status).toBe(422);
    // Ağustos 110 → 112: Eylül'ün önceki endeksi 112, tüketimi 13 olur.
    expect((await site.call("PATCH", `/v1/panel/operations/meters/readings/${aug1.id}`, { currentValue: 112, reason: "Fotoğraf yeniden okundu, 112" })).status).toBe(200);
    rows = await list();
    expect(Number(find(rows, meter1, "2026-08").consumption)).toBe(12);
    expect(Number(find(rows, meter1, "2026-09").previousValue)).toBe(112);
    expect(Number(find(rows, meter1, "2026-09").consumption)).toBe(13);
    expect(find(rows, meter1, "2026-09").amountMinor).toBe(26000);

    // Eylül borçlandırılıyor: daire 1 kiracıya, daire 2 malike.
    const bill = await site.call("POST", "/v1/panel/operations/meters/readings/bill", { period: "2026-09", dueDate: "2026-10-15T00:00:00.000Z" });
    expect(bill.status).toBe(201);
    expect(bill.body.billed).toBe(2);
    expect(bill.body.totalMinor).toBe(26000 + 10000);
    // İkinci kez: hepsi atlanır.
    expect((await site.call("POST", "/v1/panel/operations/meters/readings/bill", { period: "2026-09", dueDate: "2026-10-15T00:00:00.000Z" })).body.billed).toBe(0);

    const created = await withBypassRls("test:sayac-read", (tx) => tx.select().from(debts).where(eq(debts.tenantId, site.tenantId)));
    expect(created).toHaveLength(2);
    expect(created.find((d) => d.unitId === site.unitIds[0])!.debtorUserId).toBe(site.tenantResidentId);
    expect(created.find((d) => d.unitId === site.unitIds[1])!.debtorUserId).toBe(site.ownerIds[1]);
    expect(created.every((d) => d.kind === "utility")).toBe(true);

    rows = await list();
    const sep1 = find(rows, meter1, "2026-09");
    expect(sep1.billed).toBe(true);
    // Kilit: borçlandırılmış okuma düzeltilemez; önceki dönem de (sonrakini bozar).
    const locked = await site.call("PATCH", `/v1/panel/operations/meters/readings/${sep1.id}`, { currentValue: 130, reason: "Yanlış girildi, düzeltme" });
    expect(locked.status).toBe(409);
    expect((locked.body.error as { details: { hint: string } }).details.hint).toBe("conflict:reading_billed");
    expect((await site.call("DELETE", `/v1/panel/operations/meters/readings/${aug1.id}`, { reason: "Yanlış daireye girilmiş okuma" })).status).toBe(409);

    // Borçlandırılmamış ve sonrası olmayan okuma silinebilir: yeni bir dönem aç, sil.
    await site.call("POST", "/v1/panel/operations/meters/readings", { period: "2026-10", readingDate: "2026-10-28T00:00:00.000Z", entries: [{ meterId: meter2, currentValue: 70 }] });
    const oct2 = find(await list(), meter2, "2026-10");
    expect((await site.call("DELETE", `/v1/panel/operations/meters/readings/${oct2.id}`, { reason: "Yanlış daireye girilmiş okuma" })).status).toBe(200);
    expect(find(await list(), meter2, "2026-10")).toBeUndefined();
  });
});
