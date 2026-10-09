import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, debts, memberships, unitOccupancies, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y9: tutarlılık kontrolü, cari birleştirme, giderleri dosyadan yükleme. */
let site: TestSite;
const dupId = randomUUID();
beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y9", 3);
  // Malik1'in mükerrer kaydı: aynı ad, Malik1'in dairesinde ikinci malik (hisse 200 olur).
  const [m1] = await withBypassRls("t", (tx) => tx.select().from(users).where(eq(users.id, site.ownerIds[0]!)));
  await withBypassRls("t", async (tx) => {
    await tx.insert(users).values({ id: dupId, firstName: m1!.firstName, lastName: m1!.lastName, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: site.tenantId, userId: dupId, role: "owner", acceptedAt: new Date(), notes: "Eski kayıttan not" });
    await tx.insert(unitOccupancies).values({ tenantId: site.tenantId, unitId: site.unitIds[0]!, userId: dupId, relation: "owner", startDate: new Date("2024-01-01") });
  });
  const d = await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[1], kind: "dues", description: "Borçlusuz", amountMinor: 1_000, dueDate: "2027-01-10T09:00:00.000Z", shareTarget: "owner" });
  expect(d.status).toBe(201);
  await withBypassRls("t", (tx) => tx.update(debts).set({ debtorUserId: null }).where(eq(debts.tenantId, site.tenantId)));
  await withBypassRls("t", (tx) =>
    tx.insert(debts).values({ tenantId: site.tenantId, unitId: site.unitIds[0]!, debtorUserId: dupId, kind: "dues", description: "Mükerrerin borcu", amountKurus: 2_000, dueDate: new Date("2027-01-10T09:00:00Z") }),
  );
});
afterAll(async () => {
  if (apiReachable) {
    await site.cleanup();
    await withBypassRls("t", (tx) => tx.delete(users).where(eq(users.id, dupId)));
  }
  await closeDb();
});

type Checks = { checks: { key: string; count: number; samples: { id: string }[] }[] };
const check = (r: Checks, key: string) => r.checks.find((c) => c.key === key)!;

describe.skipIf(!apiReachable)("Y9 veri araçları", () => {
  it("tutarlılık: borçlusuz borç, hisse ≠ 100, mükerrer kişi, m²", async () => {
    const r = (await site.call("GET", "/v1/panel/data-tools/checks")).body as unknown as Checks;
    expect(check(r, "open_debt_no_debtor").count).toBe(1);
    expect(check(r, "owner_share_not_100").count).toBe(1);
    expect(check(r, "duplicate_people").samples.map((s) => s.id)).toEqual(expect.arrayContaining([dupId, site.ownerIds[0]]));
    expect((await site.call("GET", "/v1/panel/data-tools/checks", undefined, site.ownerCookie)).status).toBe(403);
  });

  it("birleştir: önizleme → taşı; hisse toplanır, not eklenir, üyelik kapanır", async () => {
    const q = `source=${dupId}&target=${site.ownerIds[0]}`;
    const p = await site.call("GET", `/v1/panel/data-tools/merge/preview?${q}`);
    expect(p.status).toBe(200);
    expect(p.body.moves).toMatchObject({ "debts.debtor_user_id": 1, "unit_occupancies.user_id": 1 });
    expect((await site.call("POST", "/v1/panel/data-tools/merge", { source: dupId, target: site.ownerIds[0], reason: "kısa" })).status).toBe(422);
    const m = await site.call("POST", "/v1/panel/data-tools/merge", { source: dupId, target: site.ownerIds[0], reason: "Aynı kişi iki kez girilmiş" });
    expect(m.status).toBe(201);
    const debtRows = await withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.debtorUserId, dupId)));
    expect(debtRows).toEqual([]);
    const occ = await withBypassRls("t", (tx) =>
      tx.select().from(unitOccupancies).where(and(eq(unitOccupancies.unitId, site.unitIds[0]!), eq(unitOccupancies.relation, "owner"))),
    );
    const active = occ.filter((o) => !o.endDate || o.endDate > new Date());
    expect(active).toHaveLength(1);
    const [mem] = await withBypassRls("t", (tx) => tx.select().from(memberships).where(and(eq(memberships.userId, site.ownerIds[0]!), eq(memberships.tenantId, site.tenantId))));
    expect(mem!.notes).toContain("Eski kayıttan not");
    const [gone] = await withBypassRls("t", (tx) => tx.select().from(memberships).where(eq(memberships.userId, dupId)));
    expect(gone!.deletedAt).not.toBeNull();
    expect((await site.call("GET", `/v1/panel/data-tools/merge/preview?${q}`)).status).toBe(404);
  });

  it("giderleri dosyadan yükle: eşleşme, mükerrer, yeni grup", async () => {
    await site.call("POST", "/v1/panel/expenses/categories", { name: "Bakım Onarım", distribution: "equal" });
    const csv = [
      "Tarih;Gider Grubu;Firma;Açıklama;Fatura No;Tutar;Ödendi",
      "05.01.2027;bakım onarım;Yıldız;Asansör bakımı;A-1;1.250,00;Evet",
      "06.01.2027;Temizlik;;Deterjan;;300;hayır",
      "06.01.2027;Temizlik;;Deterjan;;300;hayır",
      "32.01.2027;;;Bozuk tarih;;10;",
    ].join("\n");
    const body = { fileBase64: Buffer.from(csv).toString("base64"), createCategories: true };
    const p = await site.call("POST", "/v1/panel/expenses/import/preview", body);
    expect(p.status).toBe(201);
    const rows = p.body.rows as { status: string; categoryMatched: boolean; paid: boolean }[];
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "duplicate", "bad_date"]);
    expect(rows[0]!.categoryMatched).toBe(true);
    expect(p.body.newCategories).toEqual(["Temizlik"]);
    expect(p.body.totalMinor).toBe(155_000);
    const c = await site.call("POST", "/v1/panel/expenses/import", body);
    expect(c.body.created).toBe(2);
    const again = await site.call("POST", "/v1/panel/expenses/import/preview", body);
    expect((again.body.rows as { status: string }[]).slice(0, 2).map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
    const cats = await site.call("GET", "/v1/panel/expenses/categories");
    expect(JSON.stringify(cats.body)).toContain("Temizlik");
  });
});
