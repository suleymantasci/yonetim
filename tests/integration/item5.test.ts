import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { closeDb, memberships, notifications, sessions, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Analiz §5: program kullanıcıları, avukatlar, varsayılan kasa, harici
 * tahsilat grupları, gönderim raporu, silinen hareketler, hane halkı ve araç.
 */
let site: TestSite;
const ACCT = randomUUID();
let acctCookie = "";

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("madde5", 2);
  await withBypassRls("t", async (tx) => {
    await tx.insert(users).values({ id: ACCT, firstName: "Mali", lastName: "Müşavir", phone: `+90552${String(Date.now()).slice(-7)}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: site.tenantId, userId: ACCT, role: "accountant", acceptedAt: new Date() });
  });
  acctCookie = `${SESSION_COOKIE}=${(await createSession({ userId: ACCT, tenantId: site.tenantId })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("t", async (tx) => {
      await tx.delete(notifications).where(eq(notifications.tenantId, site.tenantId));
      await tx.delete(sessions).where(eq(sessions.userId, ACCT));
    });
    await site.cleanup();
    await withBypassRls("t", (tx) => tx.delete(users).where(eq(users.id, ACCT)));
  }
  await closeDb();
});

type Team = { membershipId: string; userId: string; role: string; editable: boolean; isSelf: boolean }[];

describe.skipIf(!apiReachable)("program kullanıcıları", () => {
  let invited = "";
  it("davet, mevcut kişiyi bağlama, aynı rol 409", async () => {
    const phone = `0555${String(Date.now()).slice(-7)}`;
    const res = await site.call("POST", "/v1/panel/team", { firstName: "İkinci", lastName: "Yönetici", phone, role: "manager" });
    expect(res.status).toBe(201);
    expect(res.body.linkedExisting).toBe(false);
    invited = res.body.membershipId as string;
    const again = await site.call("POST", "/v1/panel/team", { firstName: "İkinci", lastName: "Yönetici", phone, role: "manager" });
    expect(again.status).toBe(409);
    const noContact = await site.call("POST", "/v1/panel/team", { firstName: "A", lastName: "B", role: "staff" });
    expect(noContact.status).toBe(422);
    const rows = (await site.call("GET", "/v1/panel/team")).body.rows as Team;
    expect(rows.some((r) => r.membershipId === invited && r.role === "manager" && r.editable)).toBe(true);
    expect(rows.find((r) => r.isSelf)!.editable).toBe(false);
  });

  it("rol değiştir, kendini ve son yöneticiyi koru, kaldır", async () => {
    const changed = await site.call("PATCH", `/v1/panel/team/${invited}`, { role: "auditor" });
    expect(changed.status).toBe(200);
    const self = ((await site.call("GET", "/v1/panel/team")).body.rows as Team).find((r) => r.isSelf)!;
    expect((await site.call("PATCH", `/v1/panel/team/${self.membershipId}`, { role: "staff" })).status).toBe(409);
    // Muhasebeci ekibi göremez/yönetemez.
    expect((await site.call("GET", "/v1/panel/team", undefined, acctCookie)).status).toBe(403);
    const acct = ((await site.call("GET", "/v1/panel/team")).body.rows as Team).find((r) => r.userId === ACCT)!;
    expect((await site.call("DELETE", `/v1/panel/team/${acct.membershipId}`)).status).toBe(200);
    // Erişimi kaldırılan kişinin oturumu bu siteye artık geçmez.
    expect((await site.call("GET", "/v1/panel/units", undefined, acctCookie)).status).toBe(401);
  });
});

describe.skipIf(!apiReachable)("avukatlar", () => {
  it("ekle, dosyaya ata, avukata göre süz", async () => {
    const lawyer = await site.call("POST", "/v1/panel/legal/lawyers", { name: "Av. Deniz Kaya", barCity: "İstanbul", commissionPct: 12 });
    expect(lawyer.status).toBe(201);
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Eski aidat", amountMinor: 5_000, dueDate: "2025-01-10T09:00:00.000Z", shareTarget: "owner" });
    const legal = await site.call("POST", "/v1/panel/legal", { unitId: site.unitIds[0] });
    expect(legal.status).toBe(201);
    const id = legal.body.id as string;
    expect((await site.call("PATCH", `/v1/panel/legal/${id}`, { lawyerId: lawyer.body.id })).status).toBe(200);
    const filtered = await site.call("GET", `/v1/panel/legal?lawyerId=${lawyer.body.id}`);
    const rows = filtered.body.rows as { id: string; lawyerName: string }[];
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(rows[0]!.lawyerName).toBe("Av. Deniz Kaya");
    const list = (await site.call("GET", "/v1/panel/legal/lawyers")).body.rows as { openCases: number; commissionPct: number }[];
    expect(list[0]).toMatchObject({ openCases: 1, commissionPct: 12 });
  });
});

describe.skipIf(!apiReachable)("varsayılan kasa ve harici tahsilat grupları", () => {
  it("ayar banka özetine yansır", async () => {
    const settings = (await site.call("GET", "/v1/panel/settings")).body as { name: string };
    const save = await site.call("PATCH", "/v1/panel/settings", { name: settings.name, defaultPaymentMethod: "cash" });
    expect(save.status).toBe(200);
    const bank = (await site.call("GET", "/v1/panel/bank")).body as { collectionDefaults: { method: string; bankAccountId: string | null } };
    expect(bank.collectionDefaults).toEqual({ method: "cash", bankAccountId: null });
    const bad = await site.call("PATCH", "/v1/panel/settings", { name: settings.name, defaultBankAccountId: randomUUID() });
    expect(bad.status).toBe(404);
  });

  it("grup: otomatik 602.1x kod, aynı ad 409, gelir hareketi gruba bağlanır ve fişe yazılır", async () => {
    const g = await site.call("POST", "/v1/panel/cash/income-groups", { name: "Vadeli hesap faizi" });
    expect(g.status).toBe(201);
    expect((await site.call("POST", "/v1/panel/cash/income-groups", { name: "vadeli HESAP faizi" })).status).toBe(409);
    const income = await site.call("POST", "/v1/panel/cash/incomes", {
      date: "2026-03-01", amountMinor: 12_345, to: { account: "cash" }, incomeGroupId: g.body.id, payerName: "Banka A.Ş.",
    });
    expect(income.status).toBe(201);
    const cash = (await site.call("GET", "/v1/panel/cash")).body as {
      incomeGroups: { id: string; accountCode: string; usage: number }[];
      movements: { incomeGroupName: string | null }[];
    };
    expect(cash.incomeGroups[0]).toMatchObject({ accountCode: "602.10", usage: 1 });
    expect(cash.movements[0]!.incomeGroupName).toBe("Vadeli hesap faizi");
    const mizan = await site.call("GET", "/v1/panel/reports/accounting/journal?from=2026-01-01&to=2026-12-31");
    expect(JSON.stringify(mizan.body)).toContain("602.10");
    // Ne kategori ne grup: 422.
    expect((await site.call("POST", "/v1/panel/cash/incomes", { date: "2026-03-01", amountMinor: 1, to: { account: "cash" }, payerName: "X Y" })).status).toBe(422);
  });
});

describe.skipIf(!apiReachable)("raporlar: gönderimler ve silinenler", () => {
  it("gönderim raporu alıcıyı maskeler, kanal özetini verir", async () => {
    await withBypassRls("t", (tx) =>
      tx.insert(notifications).values([
        { tenantId: site.tenantId, userId: site.ownerIds[0], channel: "sms", template: "reminder", recipient: "+905551234567", status: "sent", costKurus: 25, createdAt: new Date("2026-03-02T10:00:00Z") },
        { tenantId: site.tenantId, userId: site.ownerIds[0], channel: "email", template: "receipt", recipient: "malik@example.com", subject: "Makbuz", status: "failed", error: "bounce", createdAt: new Date("2026-03-03T10:00:00Z") },
      ]),
    );
    const res = await site.call("GET", "/v1/panel/reports/debts/messages?from=2026-03-01&to=2026-03-31");
    const body = res.body as { rows: { recipient: string; channel: string }[]; byChannel: { channel: string; sent: number; failed: number; costMinor: number }[] };
    expect(body.rows).toHaveLength(2);
    expect(body.rows.map((r) => r.recipient).join(" ")).not.toContain("1234567");
    expect(body.rows.find((r) => r.channel === "email")!.recipient).toBe("ma***@example.com");
    expect(body.byChannel.find((b) => b.channel === "sms")).toMatchObject({ sent: 1, costMinor: 25 });
    const failed = await site.call("GET", "/v1/panel/reports/debts/messages?from=2026-03-01&to=2026-03-31&status=failed");
    expect((failed.body.rows as unknown[]).length).toBe(1);
  });

  it("silinen hareketler: iptal borç (kim/neden) ve iptal tahsilat", async () => {
    const d = await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[1], kind: "extra", description: "Hatalı borç", amountMinor: 700, dueDate: "2026-12-10T09:00:00.000Z", shareTarget: "owner" });
    const debtId = (d.body.ids as string[])[0]!;
    expect((await site.call("POST", "/v1/panel/debts/cancel", { ids: [debtId], reason: "Yanlış daireye yazıldı" })).status).toBe(201);
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[1], kind: "dues", description: "Aidat", amountMinor: 1_000, dueDate: "2026-12-10T09:00:00.000Z", shareTarget: "owner" });
    const pay = await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[1], amountMinor: 300, method: "cash", paidAt: new Date().toISOString() });
    expect(pay.status).toBe(201);
    const voided = await site.call("POST", `/v1/panel/debts/payments/${pay.body.paymentId}/void`, { reason: "Mükerrer giriş" });
    expect(voided.status).toBe(201);
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const res = await site.call("GET", `/v1/panel/reports/debts/deleted?from=2026-01-01&to=${today}`);
    expect(res.status).toBe(200);
    const rows = res.body.rows as { kind: string; reason: string | null; byName: string | null; amountMinor: number }[];
    const debt = rows.find((r) => r.kind === "debt")!;
    expect(debt).toMatchObject({ reason: "Yanlış daireye yazıldı", amountMinor: 700 });
    expect(debt.byName).toContain("Yönetici");
    expect(rows.find((r) => r.kind === "payment")).toMatchObject({ reason: "Mükerrer giriş" });
    expect((await site.call("GET", `/v1/panel/reports/debts/deleted?from=2026-01-01&to=${today}&kind=cash`)).body.rows).toEqual([]);
  });
});

describe.skipIf(!apiReachable)("hane halkı ve araçlar", () => {
  it("kişi ve plaka ekle; plaka tekil ve normalize; plakadan daire bulunur", async () => {
    const u = site.unitIds[0]!;
    expect((await site.call("POST", `/v1/panel/units/${u}/household`, { fullName: "Elif Malik", relation: "child", birthYear: 2012 })).status).toBe(201);
    const v = await site.call("POST", `/v1/panel/units/${u}/vehicles`, { plate: "34 abc 123", description: "Beyaz" });
    expect(v.status).toBe(201);
    expect((await site.call("POST", `/v1/panel/units/${site.unitIds[1]}/vehicles`, { plate: "34-ABC-123" })).status).toBe(409);
    const extras = (await site.call("GET", `/v1/panel/units/${u}/extras`)).body as { household: { fullName: string; relation: string }[]; vehicles: { plate: string }[] };
    expect(extras.household[0]).toMatchObject({ fullName: "Elif Malik", relation: "child" });
    expect(extras.vehicles[0]!.plate).toBe("34ABC123");
    const found = (await site.call("GET", "/v1/panel/units/vehicles?plate=abc12")).body.rows as { unitId: string }[];
    expect(found.map((r) => r.unitId)).toEqual([u]);
    const list = (await site.call("GET", "/v1/panel/units?search=34abc")).body.rows as { id: string }[];
    expect(list.map((r) => r.id)).toEqual([u]);
    expect((await site.call("DELETE", `/v1/panel/units/${u}/vehicles/${v.body.id}`)).status).toBe(200);
  });
});
