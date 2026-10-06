import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import {
  bankAccounts, bankTransactions, closeDb, expenses, memberships, payments, sessions, tenants, users, withBypassRls,
} from "@yonetim/db";

/** Kasa mutabakatı: nakit/banka kovaları, iade düşümü, ödenmiş/ödenmemiş gider, eşleşme sayaçları. */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const T = randomUUID();
const MANAGER = randomUUID();
const ACC = randomUUID();
let cookie = "";
let apiReachable = false;

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!apiReachable) return;
  const s = String(Date.now()).slice(-5);
  await withBypassRls("test:overview-setup", async (tx) => {
    await tx.insert(tenants).values({ id: T, slug: `kasa-${s}`, name: "Kasa Testi", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values({ id: MANAGER, firstName: "Y", lastName: "Kasa", phone: `+9055522${s}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: T, userId: MANAGER, role: "manager", acceptedAt: new Date() });
    await tx.insert(bankAccounts).values({ id: ACC, tenantId: T, bankName: "Kasa Bank", ibanEncrypted: "x", ibanMasked: "TR00 **** 0000" });
    const base = { tenantId: T, status: "completed" as const, paidAt: new Date(), processor: "manual" as const };
    await tx.insert(payments).values([
      { ...base, amountKurus: 100_000, method: "bank_transfer", bankAccountId: ACC },
      { ...base, amountKurus: 50_000, refundedKurus: 10_000, method: "bank_transfer", bankAccountId: ACC },
      { ...base, amountKurus: 30_000, method: "cash" },
      { ...base, amountKurus: 99_999, method: "cash", status: "failed" as const },
    ] as never);
    await tx.insert(expenses).values([
      { tenantId: T, expenseDate: new Date(), description: "Ödenmiş", amountKurus: 20_000, bankAccountId: ACC, paidAt: new Date(), status: "paid" },
      { tenantId: T, expenseDate: new Date(), description: "Nakit ödenen", amountKurus: 5_000, paidAt: new Date(), status: "paid" },
      { tenantId: T, expenseDate: new Date(), description: "Bekleyen", amountKurus: 7_000, status: "approved" },
    ] as never);
    const tx0 = { tenantId: T, accountId: ACC, direction: "in" as const, amountKurus: 1, transactionAt: new Date(), provider: "manual_csv" };
    await tx.insert(bankTransactions).values([
      { ...tx0, externalId: "a", matchStatus: "auto" },
      { ...tx0, externalId: "b", matchStatus: "manual" },
      { ...tx0, externalId: "c", matchStatus: "suggested" },
      { ...tx0, externalId: "d", matchStatus: "unmatched" },
      { ...tx0, externalId: "e", matchStatus: "ignored" },
    ]);
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: T })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:overview-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(bankTransactions).where(eq(bankTransactions.tenantId, T));
      await tx.delete(expenses).where(eq(expenses.tenantId, T));
      await tx.delete(payments).where(eq(payments.tenantId, T));
      await tx.delete(bankAccounts).where(eq(bankAccounts.tenantId, T));
      await tx.delete(memberships).where(eq(memberships.tenantId, T));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(tenants).where(eq(tenants.id, T));
    });
  }
  await closeDb();
});

describe.skipIf(!process.env.INTEGRATION)("kasa ve banka özeti", () => {
  it("banka ve nakit kovaları: iade düşer, başarısız tahsilat sayılmaz, gider kaynağına göre çıkar", async () => {
    if (!apiReachable) return;
    const res = await fetch(`${BASE}/v1/panel/bank`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const bank = body.cashbox.rows.find((r: any) => r.source === "bank");
    const cash = body.cashbox.rows.find((r: any) => r.source === "cash");
    // giren: 100.000 + (50.000 − 10.000 iade); çıkan: 20.000 banka giderı
    expect(bank).toMatchObject({ incomingMinor: 140_000, outgoingMinor: 20_000, balanceMinor: 120_000 });
    // nakit: 30.000 giren (başarısız 99.999 sayılmaz); 5.000 nakit gider
    expect(cash).toMatchObject({ incomingMinor: 30_000, outgoingMinor: 5_000, balanceMinor: 25_000 });
    expect(body.cashbox.totals.unpaidExpenseMinor).toBe(7_000);
  });

  it("eşleşme sayaçları: auto/manual eşleşmiş, unmatched/suggested bekliyor, ignored hiçbiri", async () => {
    if (!apiReachable) return;
    const body = (await (await fetch(`${BASE}/v1/panel/bank`, { headers: { cookie } })).json()) as any;
    expect(body.totals.unmatched).toBe(2);
    expect(body.totals.matchRatePct).toBe(40); // 2 / 5
  });
});
