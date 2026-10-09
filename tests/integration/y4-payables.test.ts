import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@yonetim/db";
import { generateRecurringExpenses } from "@yonetim/jobs";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y4: ödenecekler süzgeçleri ve tekrarlayan faturalar (iş + şimdi üret, idempotans). */
let site: TestSite;
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y4", 1);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

type P = { rows: { id: string; party: string; paid: boolean; recurring: boolean; amountMinor: number }[]; totals: { pendingMinor: number; paidMinor: number } };

describe.skipIf(!apiReachable)("ödenecekler ve tekrarlayan faturalar", () => {
  let recurringId = "";
  it("tanım → şimdi üret → aynı dönem tekrar üretilmez; iş de idempotent", async () => {
    const res = await site.call("POST", "/v1/panel/payables/recurring", {
      description: "Asansör bakımı", amountMinor: 120_000, vatRate: 0.2, dayOfMonth: 1, startPeriod: "2026-08",
    });
    expect(res.status).toBe(201);
    recurringId = res.body.id as string;
    const run = await site.call("POST", `/v1/panel/payables/recurring/${recurringId}/run`);
    expect(run.body.created).toBeGreaterThanOrEqual(3); // Ağu, Eyl, Eki (+ bugünse sonraki)
    const again = await site.call("POST", `/v1/panel/payables/recurring/${recurringId}/run`);
    expect(again.body.created).toBe(0);
    expect((await generateRecurringExpenses({ tenantId: site.tenantId })).created).toBe(0);
    const list = (await site.call("GET", "/v1/panel/payables/recurring")).body.rows as { generated: number; lastPeriod: string; nextDate: string }[];
    expect(list[0]!.generated).toBe(run.body.created);
    expect(list[0]!.nextDate > `${list[0]!.lastPeriod}-01`).toBe(true);
    expect((await site.call("POST", "/v1/panel/payables/recurring", { description: "X X X", amountMinor: 1, startPeriod: "2026-09", endPeriod: "2026-08" })).status).toBe(422);
  });

  it("ödenecekler: bekleyen → ödendi işaretle → ödenmiş", async () => {
    const pending = (await site.call("GET", "/v1/panel/payables?state=pending")).body as unknown as P;
    expect(pending.rows.every((r) => !r.paid && r.recurring && r.party === "expense")).toBe(true);
    const ids = pending.rows.slice(0, 1).map((r) => r.id);
    expect((await site.call("PATCH", "/v1/panel/expenses/status", { ids, status: "paid" })).status).toBe(200);
    const paid = (await site.call("GET", "/v1/panel/payables?state=paid")).body as unknown as P;
    expect(paid.rows.map((r) => r.id)).toEqual(ids);
    expect(paid.totals.paidMinor).toBe(120_000);
    expect(((await site.call("GET", "/v1/panel/payables?party=vendor")).body as unknown as P).rows).toEqual([]);
  });

  it("tanım silinince üretilmiş giderler kalır", async () => {
    expect((await site.call("DELETE", `/v1/panel/payables/recurring/${recurringId}`)).status).toBe(200);
    const all = (await site.call("GET", "/v1/panel/payables?state=all")).body as unknown as P;
    expect(all.rows.length).toBeGreaterThanOrEqual(3);
  });
});
