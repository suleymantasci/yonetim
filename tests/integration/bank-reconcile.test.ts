import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import {
  bankAccounts, bankTransactions, blocks, closeDb, debts, expenseCategories, expenses, memberships, notifications,
  payments, sessions, tenants, unitOccupancies, units, users, withBypassRls,
} from "@yonetim/db";
import { BANK_FIXTURES } from "@yonetim/bank/fixtures";

/**
 * Banka dökümü: önizleme (sütun tahmini), eşleştirmeyle içe aktarma, öneri,
 * onay (tahsilat), toplu tahsilat, gidere çevirme, yok sayma, tekrar yükleme,
 * kayıtlı eşleştirme, büyük dosya.
 */
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
let categoryId = "";
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
    const [c] = await tx.insert(expenseCategories).values({ tenantId: T, name: "Asansör bakımı" }).returning({ id: expenseCategories.id });
    categoryId = c!.id;
  });
  cookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: T })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:recon-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(notifications).where(eq(notifications.tenantId, T));
      await tx.delete(bankTransactions).where(eq(bankTransactions.tenantId, T));
      await tx.delete(expenses).where(eq(expenses.tenantId, T));
      await tx.delete(expenseCategories).where(eq(expenseCategories.tenantId, T));
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
/** Referanslı satırın kimliği `ref-<referans>-<gün>`; elle eklenenler düz. */
const byRef = async (ref: string) =>
  (await txRows()).find((r) => r.externalId === ref || r.externalId.startsWith(`ref-${ref}-`))!;
const b64 = (data: string | Uint8Array) => Buffer.from(data).toString("base64");

/** Önizlemenin eşleştirmesiyle içe aktar (kullanıcının "İçe aktar" adımı). */
async function previewAndImport(file: string | Uint8Array, fileName: string) {
  const preview = await call("POST", "/v1/panel/bank/statement/preview", { accountId: ACCOUNT, fileName, fileBase64: b64(file) });
  const mapping = Object.fromEntries(
    (preview.body.columns as Array<{ index: number; field: string }>).map((c) => [String(c.index), c.field]),
  );
  const imported = await call("POST", "/v1/panel/bank/statement", {
    accountId: ACCOUNT, fileName, fileBase64: b64(file), headerRow: preview.body.headerRow, mapping,
  });
  return { preview, imported };
}

describe.skipIf(!process.env.INTEGRATION)("banka ekstresi mutabakatı", () => {
  it("önizleme sütunları tahmin eder, yazmaz; hatalı satırı gösterir", async () => {
    if (!apiReachable) return;
    const res = await call("POST", "/v1/panel/bank/statement/preview", { accountId: ACCOUNT, fileName: "ekstre.csv", fileBase64: b64(CSV) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ format: "csv", headerRow: 0, headerFound: true, mappingSource: "guess", problems: [] });
    expect((res.body.columns as Array<{ field: string }>).map((c) => c.field)).toEqual([
      "date", "description", "amount", "counterparty", "iban", "reference",
    ]);
    expect(res.body.totals).toMatchObject({ rows: 3, incoming: 2, outgoing: 1, incomingMinor: 153_300, outgoingMinor: 240_000, errors: 1 });
    expect(res.body.errors[0]).toMatchObject({ line: 5, reason: "bad_date" });
    expect(await txRows()).toHaveLength(0);
  });

  it("döküm yazılır: daire önerisi, eşleşmeyen, gider bekleyen ve hatalı satır ayrı raporlanır", async () => {
    if (!apiReachable) return;
    const { imported: res } = await previewAndImport(CSV, "ekstre.csv");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ parsed: 3, inserted: 3, duplicates: 0, suggested: 1, unmatched: 1, outgoing: 1 });
    expect(res.body.errors).toEqual([{ line: 5, reason: "bad_date" }]);

    const first = await byRef("DKT-1");
    expect(first).toMatchObject({ matchStatus: "suggested", matchedUnitId: unitId, direction: "in", amountKurus: 150_000 });
    expect((await byRef("DKT-2")).matchStatus).toBe("unmatched");
    // Çıkan hareket artık yok sayılmıyor: gider kuyruğunda.
    expect((await byRef("DKT-3"))).toMatchObject({ matchStatus: "unmatched", direction: "out" });

    const queue = await call("GET", "/v1/panel/bank/queue");
    expect(queue.body.incoming).toHaveLength(2);
    expect(queue.body.outgoing).toHaveLength(1);
    expect(queue.body.incoming.find((r: { id: string }) => r.id === first.id)).toMatchObject({ suggestedUnitId: unitId, suggestedUnitLabel: "A / 12" });
  });

  it("aynı dökümü tekrar yüklemek hareketleri çoğaltmaz; eşleştirme hesaba kaydedilir", async () => {
    if (!apiReachable) return;
    const { preview, imported } = await previewAndImport(CSV, "ekstre.csv");
    expect(preview.body.mappingSource).toBe("profile");
    expect(imported.body).toMatchObject({ inserted: 0, duplicates: 3 });
    expect(await txRows()).toHaveLength(3);
  });

  it("çıkan hareket ödenmiş gider olarak kaydedilir, ikinci kez kaydedilemez", async () => {
    if (!apiReachable) return;
    const out = await byRef("DKT-3");
    const res = await call("POST", `/v1/panel/bank/transactions/${out.id}/expense`, { categoryId });
    expect(res.status).toBe(201);
    const [expense] = await withBypassRls("t", (tx) => tx.select().from(expenses).where(eq(expenses.id, res.body.expenseId)));
    expect(expense).toMatchObject({ amountKurus: 240_000, status: "paid", bankAccountId: ACCOUNT, categoryId });
    expect(expense!.paidAt?.toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(await byRef("DKT-3")).toMatchObject({ matchStatus: "expense", matchedExpenseId: res.body.expenseId });
    expect((await call("POST", `/v1/panel/bank/transactions/${out.id}/expense`, { categoryId })).status).toBe(400);
    // Gelen hareket gider yapılamaz.
    const incoming = await byRef("DKT-2");
    expect((await call("POST", `/v1/panel/bank/transactions/${incoming.id}/expense`, { categoryId })).status).toBe(400);
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

  it("toplu tahsilat: biri başarısız olsa diğeri yazılır", async () => {
    if (!apiReachable) return;
    await withBypassRls("t", async (tx) => {
      await tx.insert(debts).values({ tenantId: T, unitId, debtorUserId: RESIDENT, description: "Kasım aidatı", amountKurus: 50_000, dueDate: new Date(Date.now() + 30 * DAY) });
      await tx.insert(bankTransactions).values({
        tenantId: T, accountId: ACCOUNT, externalId: "BULK-1", direction: "in", amountKurus: 50_000,
        transactionAt: new Date(), provider: "manual_file", matchStatus: "unmatched",
      });
    });
    const ok = await byRef("BULK-1");
    const done = await byRef("DKT-1"); // zaten tahsil edildi
    const res = await call("POST", "/v1/panel/bank/transactions/confirm-bulk", {
      items: [{ id: ok.id, unitId }, { id: done.id, unitId }],
    });
    expect(res.status).toBe(201);
    const byId = Object.fromEntries((res.body.results as Array<{ id: string; ok: boolean }>).map((r) => [r.id, r.ok]));
    expect(byId).toEqual({ [ok.id]: true, [done.id]: false });
    expect(await byRef("BULK-1")).toMatchObject({ matchStatus: "manual", matchedUnitId: unitId });
  });

  it("Excel (Akbank xlsx) API'den okunur; ikinci yüklemede kayıtlı eşleştirme kullanılır", async () => {
    if (!apiReachable) return;
    const akbank = BANK_FIXTURES.find((f) => f.bank === "Akbank")!;
    await withBypassRls("t", (tx) => tx.update(bankAccounts).set({ importProfile: null }).where(eq(bankAccounts.id, ACCOUNT)));
    const first = await previewAndImport(akbank.build(), akbank.fileName);
    expect(first.preview.body).toMatchObject({ format: "xlsx", headerRow: 9, mappingSource: "guess", problems: [] });
    expect(first.imported.body).toMatchObject({ parsed: 3, inserted: 3, outgoing: 1 });
    const again = await call("POST", "/v1/panel/bank/statement/preview", {
      accountId: ACCOUNT, fileName: akbank.fileName, fileBase64: b64(akbank.build()),
    });
    expect(again.body.mappingSource).toBe("profile");
  });

  it("256 KB'tan büyük döküm reddedilmez (yükleme yoluna özel gövde sınırı)", async () => {
    if (!apiReachable) return;
    const lines = ["Tarih;Açıklama;Tutar"];
    for (let i = 0; i < 6000; i++) lines.push(`0${(i % 9) + 1}.09.2026;UZUN BIR ACIKLAMA SATIRI ${i} ${"X".repeat(40)};${i + 1},00`);
    const big = lines.join("\n");
    expect(Buffer.byteLength(big)).toBeGreaterThan(300_000);
    const res = await call("POST", "/v1/panel/bank/statement/preview", { accountId: ACCOUNT, fileName: "buyuk.csv", fileBase64: b64(big) });
    expect(res.status).toBe(201);
    expect(res.body.totals.rows).toBe(6000);
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
