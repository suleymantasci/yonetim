import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Kasa işlemleri, işletme projesi ve mali tablolar.
 * Ana iddia: hepsi aynı fiş listesinden türüyor — kasa ekranı = mizan 100/102,
 * bilanço denk, işletme defterinin kalanı = kasa + banka, hesap özetleri
 * toplamı = 120 bakiyesi.
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("kasa", 2);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const hint = (body: Record<string, unknown>) =>
  (body.error as { details?: { hint?: string } } | undefined)?.details?.hint;
const today = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

describe.skipIf(!apiReachable)("kasa işlemleri ve mali tablolar", () => {
  let bankId = "";
  let incomeId = "";

  it("virman ve harici tahsilat bakiyelere ve mizana yansır; iptal düşer", async () => {
    const bank = await site.call("POST", "/v1/panel/bank/accounts", {
      bankName: "Ziraat", iban: "TR330006100519786457841326", accountName: "Aidat hesabı",
    });
    expect(bank.status).toBe(201);
    bankId = String(bank.body.id);

    // 1.000 TL aidat, 600 TL nakit tahsilat.
    expect((await site.call("POST", "/v1/panel/debts", {
      unitId: site.unitIds[0], kind: "dues", description: "Ekim aidatı", amountMinor: 100_000, dueDate: `${today()}T00:00:00.000Z`, shareTarget: "owner",
    })).status).toBe(201);
    expect((await site.call("POST", "/v1/panel/debts/collect", {
      unitId: site.unitIds[0], amountMinor: 60_000, method: "cash", paidAt: new Date().toISOString(),
    })).status).toBe(201);

    // Kasadan bankaya 500 TL; bankaya 250 TL baz istasyonu kirası.
    const transfer = await site.call("POST", "/v1/panel/cash/transfers", {
      date: today(), amountMinor: 50_000, from: { account: "cash" }, to: { account: "bank", bankAccountId: bankId },
    });
    expect(transfer.status).toBe(201);
    const income = await site.call("POST", "/v1/panel/cash/incomes", {
      date: today(), amountMinor: 25_000, to: { account: "bank", bankAccountId: bankId }, category: "rent", payerName: "Baz istasyonu A.Ş.",
    });
    expect(income.status).toBe(201);
    incomeId = String(income.body.id);

    // Aynı hesaba virman ve banka olmadan banka seçimi reddedilir.
    expect((await site.call("POST", "/v1/panel/cash/transfers", {
      date: today(), amountMinor: 1, from: { account: "cash" }, to: { account: "cash" },
    })).status).toBe(422);
    expect((await site.call("POST", "/v1/panel/cash/incomes", {
      date: today(), amountMinor: 1, to: { account: "bank" }, category: "rent", payerName: "X Ltd",
    })).status).toBe(422);

    const overview = await site.call("GET", "/v1/panel/cash");
    const accounts = overview.body.accounts as { code: string; balanceMinor: number }[];
    expect(accounts.find((a) => a.code === "100")!.balanceMinor).toBe(10_000);
    expect(accounts.find((a) => a.code === "102.01")!.balanceMinor).toBe(75_000);
    expect(overview.body.totalMinor).toBe(85_000);

    const mizan = await site.call("GET", `/v1/panel/reports/accounting/mizan?from=${today()}&to=${today()}`);
    const rows = mizan.body.rows as { code: string; balanceMinor: number; creditMinor: number }[];
    expect(rows.find((r) => r.code === "602.01")!.creditMinor).toBe(25_000);
    expect(rows.find((r) => r.code === "102")!.balanceMinor).toBe(75_000);

    // İptal: gelir defterden düşer, ikinci iptal çakışma.
    expect((await site.call("POST", `/v1/panel/cash/movements/${incomeId}/void`, { reason: "Yanlış hesaba girildi" })).status).toBe(201);
    const again = await site.call("POST", `/v1/panel/cash/movements/${incomeId}/void`, { reason: "Yanlış hesaba girildi" });
    expect(hint(again.body)).toBe("conflict:already_voided");
    const after = await site.call("GET", "/v1/panel/cash");
    expect(after.body.totalMinor).toBe(60_000);
    const listed = (after.body.movements as { id: string; voidedAt: string | null }[]).find((m) => m.id === incomeId)!;
    expect(listed.voidedAt).not.toBeNull();

    // Sakin göremez.
    expect((await site.call("GET", "/v1/panel/cash", undefined, site.ownerCookie)).status).toBe(403);
  });

  it("bilanço denk; işletme defteri kalanı = kasa + banka; hesap özetleri = 120", async () => {
    const q = `from=${today().slice(0, 4)}-01-01&to=${today()}`;
    const sheet = await site.call("GET", `/v1/panel/reports/accounting/balance-sheet?at=${today()}`);
    expect(sheet.status).toBe(200);
    const totals = sheet.body.totals as { assetsMinor: number; liabilitiesMinor: number; equityMinor: number; periodResultMinor: number };
    expect(totals.assetsMinor).toBe(totals.liabilitiesMinor + totals.equityMinor);
    expect(totals.periodResultMinor).toBe(100_000);

    const book = await site.call("GET", `/v1/panel/reports/accounting/operating-book?${q}`);
    expect(book.body.closingMinor).toBe(60_000);
    // Virman ve iptal edilen gelir deftere girmez: yalnız tahsilat.
    expect((book.body.lines as unknown[]).length).toBe(1);

    const statements = await site.call("GET", `/v1/panel/reports/accounting/unit-statements?${q}&detail=1`);
    const st = statements.body.totals as { closingMinor: number; chargedMinor: number; paidMinor: number };
    expect(st).toMatchObject({ chargedMinor: 100_000, paidMinor: 60_000, closingMinor: 40_000 });
    const ledger120 = await site.call("GET", `/v1/panel/reports/accounting/ledger?code=120&${q}`);
    expect(ledger120.body.closingMinor).toBe(40_000);

    const income = await site.call("GET", `/v1/panel/reports/accounting/income-statement?${q}`);
    expect((income.body.totals as { netMinor: number }).netMinor).toBe(100_000);

    const activity = await site.call("GET", `/v1/panel/reports/accounting/activity?${q}`);
    expect(activity.status).toBe(200);
    expect(activity.body.finance).toMatchObject({ chargedMinor: 100_000, collectedMinor: 60_000, receivablesMinor: 40_000 });

    expect((await site.call("GET", `/v1/panel/reports/accounting/income-statement?from=2026-05-01&to=2026-01-01`)).status).toBe(400);
  });

  it("kasa devir tutanağı o günün rakamlarını dondurur", async () => {
    const created = await site.call("POST", "/v1/panel/cash/handovers", { date: today(), fromName: "Eski Yönetici", toName: "Yeni Yönetici" });
    expect(created.status).toBe(201);
    const h = await site.call("GET", `/v1/panel/cash/handovers/${String(created.body.id)}`);
    expect(h.body.snapshot).toMatchObject({ cashTotalMinor: 60_000, receivablesMinor: 40_000, openDebtorCount: 1 });
  });
});

describe.skipIf(!apiReachable)("işletme projesi", () => {
  it("taslak → onay (kilit) → aidat planı; dağıtım arsa payıyla", async () => {
    const start = `${today().slice(0, 4)}-01`;
    const end = `${today().slice(0, 4)}-12`;
    const created = await site.call("POST", "/v1/panel/budgets", {
      name: "Yıllık proje", startPeriod: start, endPeriod: end, formula: "land_share", reservePct: 10,
      lines: [
        { label: "Personel", source: "staff", plannedMinor: 1_200_000 },
        { label: "Elektrik", source: "", plannedMinor: 120_000 },
      ],
    });
    expect(created.status).toBe(201);
    const id = String(created.body.id);

    const detail = await site.call("GET", `/v1/panel/budgets/${id}`);
    const b = detail.body.budget as { totalMinor: number; monthlyMinor: number; months: number; status: string };
    expect(b).toMatchObject({ totalMinor: 1_452_000, monthlyMinor: 121_000, months: 12, status: "draft" });
    const shares = detail.body.shares as { monthlyMinor: number }[];
    expect(shares.reduce((s, x) => s + x.monthlyMinor, 0)).toBe(121_000);

    // Onaysız proje aidat planına dönmez.
    expect(hint((await site.call("POST", `/v1/panel/budgets/${id}/dues-plan`, {})).body)).toBe("conflict:budget_not_approved");
    expect((await site.call("POST", `/v1/panel/budgets/${id}/approve`, { note: "Olağan genel kurul, karar 2" })).status).toBe(201);
    // Onaylı proje kilitli.
    const patch = await site.call("PATCH", `/v1/panel/budgets/${id}`, {
      name: "Değişmiş", startPeriod: start, endPeriod: end, lines: [{ label: "Değişik kalem", plannedMinor: 1 }],
    });
    expect(hint(patch.body)).toBe("conflict:budget_approved");
    expect(hint((await site.call("DELETE", `/v1/panel/budgets/${id}`)).body)).toBe("conflict:budget_approved");

    const plan = await site.call("POST", `/v1/panel/budgets/${id}/dues-plan`, { dueDayOfMonth: 5 });
    expect(plan.status).toBe(201);
    expect(hint((await site.call("POST", `/v1/panel/budgets/${id}/dues-plan`, {})).body)).toBe("conflict:dues_plan_exists");
    const plans = await site.call("GET", "/v1/panel/dues-plans");
    const created2 = (plans.body.plans as { id: string; totalAmountMinor: number; formula: string; startPeriod: string }[]).find(
      (p) => p.id === plan.body.duesPlanId,
    )!;
    expect(created2).toMatchObject({ totalAmountMinor: 121_000, formula: "land_share", startPeriod: start });

    const list = await site.call("GET", "/v1/panel/budgets");
    expect((list.body.rows as unknown[]).length).toBe(1);
  });
});
