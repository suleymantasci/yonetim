import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import {
  bankAccounts, bankTransactions, blocks, closeDb, debts, memberships, notifications, payments, sessions,
  tenants, unitOccupancies, units, users, withBypassRls,
} from "@yonetim/db";

/** Banka ekstresi: içe aktarma, öneri, onay (tahsilat), yok sayma, tekrar yükleme. */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const T = randomUUID();
const MANAGER = randomUUID();
const RESIDENT = randomUUID();
const ACCOUNT = randomUUID();
const DAY = 86_400_000;
let cookie = "";
let unitId = "";
let debtId = "";
let apiReachable = false;

const CSV = [
  "Tarih;Açıklama;Tutar;Karşı Taraf;IBAN;Referans",
  "05.10.2026;AIDAT DAIRE 12 EKIM;1.500,00;ALI VELI;TR330006100519786457841326;DKT-1",
  "06.10.2026;BILINMEYEN HAVALE;33,00;;;DKT-2",
  "07.10.2026;ASANSOR BAKIM;-2.400,00;ASANSOR AS;;DKT-3",
  "bozuk;satir;x",
].join("\n");

beforeAll(async () => {
  apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);
  if (!apiReachable) return;
  const s = String(Date.now()).slice(-5);
  await withBypassRls("test:recon-setup", async (tx) => {
    await tx.insert(tenants).values({ id: T, slug: `banka-${s}`, name: "Banka Testi", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Y", lastName: "Banka", phone: `+9055520${s}`, locale: "tr" },
      { id: RESIDENT, firstName: "Ali", lastName: "Veli", phone: `+9055521${s}`, locale: "tr" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: T, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: T, userId: RESIDENT, role: "owner", acceptedAt: new Date() },
    ]);
    const [b] = await tx.insert(blocks).values({ tenantId: T, name: "A", floorCount: 1, unitCount: 1 }).returning({ id: blocks.id });
    const [u] = await tx.insert(units).values({ tenantId: T, blockId: b!.id, number: "12", floor: 1, type: "flat", areaM2: "80", landShare: "1" }).returning({ id: units.id });
    unitId = u!.id;
    await tx.insert(unitOccupancies).values({ tenantId: T, unitId, userId: RESIDENT, relation: "owner", startDate: new Date(Date.now() - 400 * DAY) });
    const [d] = await tx.insert(debts).values({ tenantId: T, unitId, debtorUserId: RESIDENT, description: "Ekim aidatı", amountKurus: 150_000, dueDate: new Date(Date.now() + 5 * DAY) }).returning({ id: debts.id });
    debtId = d!.id;
    await tx.insert(bankAccounts).values({ id: ACCOUNT, tenantId: T, bankName: "Test Bank", ibanEncrypted: "x", ibanMasked: "TR33 **** 1326" });
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: T })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:recon-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(notifications).where(eq(notifications.tenantId, T));
      await tx.delete(bankTransactions).where(eq(bankTransactions.tenantId, T));
      await tx.delete(payments).where(eq(payments.tenantId, T));
      await tx.delete(debts).where(eq(debts.tenantId, T));
      await tx.delete(bankAccounts).where(eq(bankAccounts.tenantId, T));
      await tx.delete(unitOccupancies).where(eq(unitOccupancies.tenantId, T));
      await tx.delete(units).where(eq(units.tenantId, T));
      await tx.delete(blocks).where(eq(blocks.tenantId, T));
      await tx.delete(memberships).where(eq(memberships.tenantId, T));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(users).where(eq(users.id, RESIDENT));
      await tx.delete(tenants).where(eq(tenants.id, T));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

const txRows = () => withBypassRls("t", (tx) => tx.select().from(bankTransactions).where(eq(bankTransactions.tenantId, T)));
const byRef = async (ref: string) => (await txRows()).find((r) => r.externalId === ref)!;

describe.skipIf(!process.env.INTEGRATION)("banka ekstresi mutabakatı", () => {
  it("ekstre yazılır: daire önerisi, eşleşmeyen, çıkan hareket ve hatalı satır ayrı raporlanır", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/panel/bank/statement", { accountId: ACCOUNT, csv: CSV });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ parsed: 3, inserted: 3, duplicates: 0, suggested: 1, unmatched: 1, outgoing: 1 });
    expect(res.body.errors).toEqual([{ line: 5, reason: "bad_date" }]);

    const first = await byRef("DKT-1");
    expect(first).toMatchObject({ matchStatus: "suggested", matchedUnitId: unitId, direction: "in", amountKurus: 150_000 });
    expect((await byRef("DKT-2")).matchStatus).toBe("unmatched");
    expect((await byRef("DKT-3")).matchStatus).toBe("ignored");
  });

  it("aynı ekstreyi tekrar yüklemek hareketleri çoğaltmaz", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/panel/bank/statement", { accountId: ACCOUNT, csv: CSV });
    expect(res.body).toMatchObject({ inserted: 0, duplicates: 3 });
    expect(await txRows()).toHaveLength(3);
  });

  it("öneri tahsilat açmaz; onay borcu kapatır ve hareketi bağlar", async () => {
    if (!apiReachable) return;
    expect(await withBypassRls("t", (tx) => tx.select().from(payments).where(eq(payments.tenantId, T)))).toHaveLength(0);

    const first = await byRef("DKT-1");
    const res = await call("POST", `/v1/panel/bank/transactions/${first.id}/confirm`, {});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("auto");

    const [debt] = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.id, debtId)));
    expect(debt).toMatchObject({ status: "paid", paidKurus: 150_000 });
    const after = await byRef("DKT-1");
    expect(after).toMatchObject({ matchStatus: "auto", matchedPaymentId: res.body.paymentId });
    const [pay] = await withBypassRls("t", (tx) => tx.select().from(payments).where(eq(payments.id, res.body.paymentId)));
    expect(pay).toMatchObject({ method: "bank_transfer", bankAccountId: ACCOUNT, amountKurus: 150_000 });
  });

  it("aynı hareket ikinci kez onaylanamaz", async () => {
    if (!apiReachable) return;
    const first = await byRef("DKT-1");
    expect((await call("POST", `/v1/panel/bank/transactions/${first.id}/confirm`, {})).status).toBe(400);
    expect(await withBypassRls("t", (tx) => tx.select().from(payments).where(eq(payments.tenantId, T)))).toHaveLength(1);
  });

  it("eşleşmeyen hareket için daire seçilmeden onay reddedilir; yok sayma gerekçe ister", async () => {
    if (!apiReachable) return;
    const unmatched = await byRef("DKT-2");
    expect((await call("POST", `/v1/panel/bank/transactions/${unmatched.id}/confirm`, {})).status).toBe(422);
    expect((await call("POST", `/v1/panel/bank/transactions/${unmatched.id}/ignore`, { reason: "x" })).status).toBe(422);
    const res = await call("POST", `/v1/panel/bank/transactions/${unmatched.id}/ignore`, { reason: "Kişisel havale, aidat değil" });
    expect(res.status).toBe(201);
    expect((await byRef("DKT-2")).matchStatus).toBe("ignored");
  });

  it("açık borcu olmayan daireye onay tahsilat yazmaz ve hareket yeniden onaylanabilir kalır", async () => {
    if (!apiReachable) return;
    await withBypassRls("t", (tx) => tx.insert(bankTransactions).values({
      tenantId: T, accountId: ACCOUNT, externalId: "DKT-9", direction: "in", amountKurus: 10_000,
      transactionAt: new Date(), provider: "manual_csv", matchStatus: "unmatched",
    }));
    const row = await byRef("DKT-9");
    const res = await call("POST", `/v1/panel/bank/transactions/${row.id}/confirm`, { unitId });
    expect(res.status).toBe(400); // no_open_debts
    expect((await byRef("DKT-9")).matchStatus).toBe("unmatched");
  });
});
