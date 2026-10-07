import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Personel carisi, açılış fişi, yevmiye ve devirli mizan.
 * Ana iddia: her fiş denk; mizanda devir + hareket = bakiye ve toplamlar denk.
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("defter", 2);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const hint = (body: Record<string, unknown>) =>
  (body.error as { details?: { hint?: string } } | undefined)?.details?.hint;

type Ledger = { payableMinor: number; advanceMinor: number; lines: { kind: string; entryId: string | null; payableMinor: number; advanceMinor: number }[] };

describe.skipIf(!apiReachable)("personel carisi", () => {
  let staffId = "";

  it("tahakkuk, avans, mahsup, ödeme ve iptal bakiyeleri doğru yürütür", async () => {
    const created = await site.call("POST", "/v1/panel/staff", {
      fullName: "Kapıcı Ahmet", role: "kapici", netSalaryMinor: 2_000_000, grossSalaryMinor: 2_600_000, startedAt: "2025-01-01T00:00:00.000Z",
    });
    expect(created.status).toBe(201);
    staffId = String(created.body.id);
    const ledger = async () => (await site.call("GET", `/v1/panel/staff/${staffId}/ledger`)).body as unknown as Ledger;

    // Toplu tahakkuk: Eylül.
    const accrue = await site.call("POST", "/v1/panel/staff/payroll/accrue", { period: "2026-09", entryDate: "2026-09-30T00:00:00.000Z" });
    expect(accrue.body.created).toBe(1);
    expect((await site.call("POST", "/v1/panel/staff/payroll/accrue", { period: "2026-09", entryDate: "2026-09-30T00:00:00.000Z" })).body.created).toBe(0);
    const dup = await site.call("POST", `/v1/panel/staff/${staffId}/ledger`, { kind: "accrual", period: "2026-09", amountMinor: 100, entryDate: "2026-09-30T00:00:00.000Z" });
    expect(hint(dup.body)).toBe("conflict:accrual_exists");

    // Avans 500 TL (nakit), mahsup sınırı.
    expect((await site.call("POST", `/v1/panel/staff/${staffId}/payments`, { kind: "advance", amountMinor: 50_000, paidAt: "2026-09-15T00:00:00.000Z" })).status).toBe(201);
    const over = await site.call("POST", `/v1/panel/staff/${staffId}/ledger`, { kind: "advance_deduction", amountMinor: 60_000, entryDate: "2026-09-30T00:00:00.000Z" });
    expect(hint(over.body)).toBe("conflict:deduction_exceeds_advance");
    const ded = await site.call("POST", `/v1/panel/staff/${staffId}/ledger`, { kind: "advance_deduction", amountMinor: 50_000, entryDate: "2026-09-30T00:00:00.000Z" });
    expect(ded.status).toBe(201);
    // Maaş ödemesi: 20.000 − 500 mahsup = 19.500.
    expect((await site.call("POST", `/v1/panel/staff/${staffId}/payments`, { kind: "salary", amountMinor: 1_950_000, paidAt: "2026-10-01T00:00:00.000Z" })).status).toBe(201);

    let l = await ledger();
    expect(l.payableMinor).toBe(0);
    expect(l.advanceMinor).toBe(0);
    expect(l.lines.map((x) => x.kind)).toEqual(["advance", "accrual", "advance_deduction", "salary"]);

    // Mahsubu iptal et: 500 maaş borcu açık kalır, 500 avans da açık (net sıfır).
    const dedEntry = l.lines.find((x) => x.kind === "advance_deduction")!.entryId!;
    expect((await site.call("POST", `/v1/panel/staff/${staffId}/ledger/${dedEntry}/void`, { reason: "Yanlış tutarla girildi" })).status).toBe(201);
    l = await ledger();
    expect(l.payableMinor).toBe(50_000);
    expect(l.advanceMinor).toBe(50_000);

    // Liste de cariden okuyor.
    const list = (await site.call("GET", "/v1/panel/staff")).body.rows as { id: string; advanceBalanceMinor: number; payableMinor: number }[];
    expect(list.find((r) => r.id === staffId)).toMatchObject({ advanceBalanceMinor: 50_000, payableMinor: 50_000 });

    // Sakin göremez.
    expect((await site.call("GET", `/v1/panel/staff/${staffId}/ledger`, undefined, site.ownerCookie)).status).toBe(403);
  });

  it("açılış fişi: kasa, tedarikçi, personel, sakin devir borcu; kilit ve idempotent kayıt", async () => {
    const v = await site.call("POST", "/v1/panel/vendors", { name: "Temizlik Ltd", category: "temizlik" });
    const vendorId = String(v.body.id);
    const body = {
      asOf: "2026-06-30",
      cashMinor: 300_000,
      vendors: [{ vendorId, amountMinor: 100_000 }],
      staff: [{ staffId, payableMinor: 40_000, advanceMinor: 0 }],
      units: [{ unitId: site.unitIds[0], amountMinor: 250_000 }, { unitId: site.unitIds[1], amountMinor: 0 }],
    };
    const saved = await site.call("PUT", "/v1/panel/reports/accounting/opening", body);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ unitsCreated: 1, unitsUpdated: 0 });
    // İkinci kayıt yeni borç açmaz.
    expect((await site.call("PUT", "/v1/panel/reports/accounting/opening", body)).body).toMatchObject({ unitsCreated: 0, unitsUpdated: 0 });

    const opening = (await site.call("GET", "/v1/panel/reports/accounting/opening")).body as Record<string, any>;
    expect(opening.asOf).toBe("2026-06-30");
    expect(opening.cashMinor).toBe(300_000);
    // varlık 300.000 + 250.000 − borç 100.000 − 40.000
    expect(opening.equityMinor).toBe(410_000);

    // Devir borcuna tahsilat → kilit.
    expect((await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 50_000, method: "cash", paidAt: "2026-07-05T00:00:00.000Z" })).status).toBe(201);
    const locked = await site.call("PUT", "/v1/panel/reports/accounting/opening", { ...body, units: [{ unitId: site.unitIds[0], amountMinor: 300_000 }] });
    expect(locked.body.unitsLocked).toBe(1);

    // Tedarikçi carisi açılışı içeriyor.
    const vd = (await site.call("GET", `/v1/panel/vendors/${vendorId}`)).body as { vendor: { balanceMinor: number }; ledger: { kind: string }[] };
    expect(vd.vendor.balanceMinor).toBe(100_000);
    expect(vd.ledger[0]!.kind).toBe("opening");

    // Personel carisi açılış borcunu içeriyor (50.000 + 40.000).
    const l = (await site.call("GET", `/v1/panel/staff/${staffId}/ledger`)).body as unknown as Ledger;
    expect(l.payableMinor).toBe(90_000);
    expect(l.lines[0]!.kind).toBe("opening_payable");

    // Kasa dökümü açılışı içeriyor: 300.000 + 50.000 tahsilat − 500 avans − 19.500 maaş.
    const bank = (await site.call("GET", "/v1/panel/bank")).body as { cashbox: { rows: { source: string; openingMinor: number; balanceMinor: number }[] } };
    const cash = bank.cashbox.rows.find((r) => r.source === "cash")!;
    expect(cash.openingMinor).toBe(300_000);
    expect(cash.balanceMinor).toBe(300_000 + 50_000 - 50_000 - 1_950_000);
  });

  it("yevmiye ve devirli mizan denk; devir + hareket = bakiye", async () => {
    const journal = (await site.call("GET", "/v1/panel/reports/accounting/journal?from=2026-01-01&to=2026-12-31")).body as {
      entries: { source: string; lines: { debitMinor: number; creditMinor: number }[] }[];
      totals: { debitMinor: number; creditMinor: number };
    };
    expect(journal.entries.length).toBeGreaterThan(5);
    for (const e of journal.entries) {
      const dr = e.lines.reduce((s, l) => s + l.debitMinor, 0);
      const cr = e.lines.reduce((s, l) => s + l.creditMinor, 0);
      expect(dr).toBe(cr);
    }
    expect(journal.entries[0]!.source).toBe("opening");
    expect(journal.totals.debitMinor).toBe(journal.totals.creditMinor);

    // Ekim'den itibaren mizan: devirde açılış + Eylül hareketleri.
    const mizan = (await site.call("GET", "/v1/panel/reports/accounting/mizan?from=2026-10-01&to=2026-12-31")).body as {
      rows: { code: string; openingMinor: number; debitMinor: number; creditMinor: number; balanceMinor: number; sub: boolean }[];
      totals: { debitMinor: number; creditMinor: number; openingDebitMinor: number; openingCreditMinor: number };
    };
    expect(mizan.totals.debitMinor).toBe(mizan.totals.creditMinor);
    expect(mizan.totals.openingDebitMinor).toBe(mizan.totals.openingCreditMinor);
    for (const r of mizan.rows) expect(r.balanceMinor).toBe(r.openingMinor + r.debitMinor - r.creditMinor);
    const row = (c: string) => mizan.rows.find((r) => r.code === c);
    // 335: devir = 40.000 açılış + 20.000 tahakkuk (Eylül) → alacak 60.000; Ekim'de 19.500 ödeme.
    expect(row("335")!.openingMinor).toBe(-(40_000 + 2_000_000));
    expect(row("335")!.debitMinor).toBe(1_950_000);
    expect(row("770.99")!.openingMinor).toBe(2_000_000);
    // 549 özel fonlar: açılış farkı ve devir borcu.
    expect(row("549")!.openingMinor).toBe(-(410_000));
  });
});
