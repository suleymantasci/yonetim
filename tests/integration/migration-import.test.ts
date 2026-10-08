import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { blocks, closeDb, debts, migrationJobs, tenants, unitOccupancies, units, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Veri aktarımı: Yönetimcell "borç durumu" raporu yapısında (.xls kılıklı
 * HTML) dosya → önizleme → aktarım. Mevcut daire ("A / 01" = sitedeki "A / 1")
 * ikizlenmez, borcu eklenir; karşılığı olmayan kalemler "diğer"de toplanır;
 * aynı dosya ikinci kez yüklenince borç eklenmez; toplam tutmazsa hiçbir şey
 * yazılmaz.
 */
const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const HTML =
  `<html><head><meta charset="utf-8" /></head><body><table>` +
  `<tr><td colspan="7">TEST SİTESİ ( BORÇ DURUMU — TOPLAM BORÇ TUTARI )</td></tr>` +
  `<tr><th>BLOK</th><th>NO</th><th>DEVREDEN</th><th>AİDAT</th><th>YAKIT</th><th>DEMİRBAŞ</th><th>TOPLAM</th></tr>` +
  row(["A", "01", "100,00", "750,00", "0,00", "300,00", "1.150,00"]) +
  row(["B BLOK", "1", "0,00", "500,00", "250,00", "0,00", "750,00"]) +
  row(["B BLOK", "2", "0,00", "0,00", "0,00", "0,00", "0,00"]) +
  `<tr><td colspan="2">(TOPLAM)</td><td>100,00</td><td>1.250,00</td><td>250,00</td><td>300,00</td><td>1.900,00</td></tr>` +
  `</table></body></html>`;
const FILE = { fileName: "borc-durumu.xls", fileBase64: Buffer.from(HTML, "utf8").toString("base64") };

let site: TestSite;

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("gecis", 2);
  await withBypassRls("test:gecis-trial", (tx) =>
    tx.update(tenants).set({ status: "trial", trialEndsAt: new Date(Date.now() + 86_400_000) }).where(eq(tenants.id, site.tenantId)),
  );
});

afterAll(async () => {
  if (site) await site.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("veri aktarımı (Excel/HTML → daire + devir borcu)", () => {
  let mapping: Record<string, string> = {};
  let headerRow = 0;

  it("önizleme: başlık, eşleştirme, mevcut/yeni daire", async () => {
    const r = await site.call("POST", "/v1/panel/migrations/preview", FILE);
    expect(r.status).toBe(201);
    const p = r.body as {
      format: string; headerRow: number; problems: string[];
      columns: Array<{ index: number; field: string }>;
      rows: Array<{ number: string; status: string }>;
      totals: { units: number; newUnits: number; newBlocks: number; debtMinor: number; errors: number; byKind: Record<string, number> };
    };
    expect(p.format).toBe("html");
    expect(p.headerRow).toBe(1);
    expect(p.problems).toEqual([]);
    expect(p.columns.map((c) => c.field)).toEqual(["block", "unit", "debtOther", "debtDues", "debtUtility", "debtOther", "total"]);
    expect(p.rows.map((x) => x.status)).toEqual(["existing", "new", "new"]);
    expect(p.totals).toMatchObject({ units: 3, newUnits: 2, newBlocks: 1, debtMinor: 190_000, errors: 0 });
    expect(p.totals.byKind).toMatchObject({ dues: 125_000, utility: 25_000, late_fee: 0, extra: 40_000, rent: 0 });
    headerRow = p.headerRow;
    mapping = Object.fromEntries(p.columns.map((c) => [String(c.index), c.field]));
  });

  it("toplamı tutmayan eşleştirmeyle hiçbir şey yazılmaz", async () => {
    const r = await site.call("POST", "/v1/panel/migrations", {
      ...FILE, headerRow, mapping: { ...mapping, 5: "ignore" }, carriedBalanceLabel: "Devir",
    });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("migration_has_errors");
  });

  it("aktarım: mevcut daireye borç, yeni blok/daire, tür başına tek borç", async () => {
    const r = await site.call("POST", "/v1/panel/migrations", { ...FILE, headerRow, mapping, carriedBalanceLabel: "Devir" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ units: 2, existingUnits: 1, blocks: 1, debts: 4, debtMinor: 190_000, withBalance: 0 });

    const rows = await withBypassRls("test:gecis-check", (tx) =>
      tx.select({ unitId: debts.unitId, kind: debts.kind, amount: debts.amountKurus, description: debts.description, debtor: debts.debtorUserId })
        .from(debts).where(eq(debts.tenantId, site.tenantId)),
    );
    const onA1 = rows.filter((d) => d.unitId === site.unitIds[0]).sort((a, b) => a.kind.localeCompare(b.kind));
    expect(onA1.map((d) => [d.kind, d.amount, d.description])).toEqual([
      ["dues", 75_000, "Devir: AİDAT"],
      ["extra", 40_000, "Devir: DEVREDEN + DEMİRBAŞ"],
    ]);
    expect(onA1[0]!.debtor).toBe(site.ownerIds[0]);

    const created = await withBypassRls("test:gecis-units", (tx) =>
      tx.select({ number: units.number, block: blocks.name }).from(units)
        .innerJoin(blocks, eq(blocks.id, units.blockId))
        .where(and(eq(units.tenantId, site.tenantId), eq(blocks.name, "B BLOK"))),
    );
    expect(created.map((u) => u.number).sort()).toEqual(["1", "2"]);
  });

  it("aynı dosya ikinci kez: daire ve borç ikizlenmez", async () => {
    const pre = await site.call("POST", "/v1/panel/migrations/preview", { ...FILE, headerRow, mapping });
    expect((pre.body as { rows: Array<{ status: string }> }).rows.map((x) => x.status)).toEqual(["has_balance", "has_balance", "existing"]);
    const r = await site.call("POST", "/v1/panel/migrations", { ...FILE, headerRow, mapping, carriedBalanceLabel: "Devir" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ units: 0, existingUnits: 3, debts: 0, withBalance: 2 });
    const jobs = await withBypassRls("test:gecis-jobs", (tx) => tx.select().from(migrationJobs).where(eq(migrationJobs.tenantId, site.tenantId)));
    expect(jobs).toHaveLength(2);
  });
});

describe.skipIf(!apiReachable)("veri aktarımı — çöp kutusundaki daireler", () => {
  it("silinmiş daire/blok yeniden aktarımda geri gelir (tekil index çakışmaz)", async () => {
    const trashed = await withBypassRls("test:gecis-trash", async (tx) => {
      const rows = await tx.select({ id: units.id, blockId: units.blockId }).from(units)
        .innerJoin(blocks, eq(blocks.id, units.blockId))
        .where(and(eq(units.tenantId, site.tenantId), eq(blocks.name, "B BLOK")));
      for (const r of rows) await tx.update(units).set({ deletedAt: new Date() }).where(eq(units.id, r.id));
      await tx.update(blocks).set({ deletedAt: new Date() }).where(eq(blocks.id, rows[0]!.blockId!));
      return rows.length;
    });
    expect(trashed).toBe(2);
    const pre = await site.call("POST", "/v1/panel/migrations/preview", FILE);
    const p = pre.body as { headerRow: number; columns: Array<{ index: number; field: string }>; rows: Array<{ status: string }>; totals: { newBlocks: number } };
    expect(p.rows.map((x) => x.status)).toEqual(["has_balance", "has_balance", "trashed"]);
    expect(p.totals.newBlocks).toBe(0);
    const mapping = Object.fromEntries(p.columns.map((c) => [String(c.index), c.field]));
    const r = await site.call("POST", "/v1/panel/migrations", { ...FILE, headerRow: p.headerRow, mapping, carriedBalanceLabel: "Devir" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ units: 0, restoredUnits: 2, blocks: 0, debts: 0 });
    const live = await withBypassRls("test:gecis-trash-check", (tx) =>
      tx.select({ id: units.id, count: blocks.unitCount, blockDeleted: blocks.deletedAt }).from(units)
        .innerJoin(blocks, eq(blocks.id, units.blockId))
        .where(and(eq(units.tenantId, site.tenantId), eq(blocks.name, "B BLOK"), isNull(units.deletedAt))),
    );
    expect(live).toHaveLength(2);
    expect(live[0]).toMatchObject({ count: 2, blockDeleted: null });
  });
});

/**
 * Kişi bazlı rapor ("Üyelerin (cari) …"): aynı daire malik, kiracı ve eski
 * kiracı için tekrar eder; borç kişinin. Ortak telefon (baba–oğul) ayrı kişi.
 */
const PHONE = `+90532${String(Date.now()).slice(-7)}`;
const LOCAL = `(${PHONE.slice(3, 6)}) ${PHONE.slice(6, 9)}-${PHONE.slice(9, 11)}-${PHONE.slice(11)}`;
const PEOPLE_HTML =
  `<html><head><meta charset="utf-8" /></head><body><table>` +
  `<tr><td colspan="9">TEST ( ÜYELERİN (CARİ) BORÇLANDIRMA SEÇENEKLERİNE GÖRE DURUMU )</td></tr>` +
  `<tr><th>BLOK</th><th>NO</th><th>DURUMU</th><th>AD SOYAD</th><th>TELEFON</th><th>AİDAT</th><th>DEMİRBAŞ</th><th>AVANS</th><th>TOPLAM</th></tr>` +
  row(["K BLOK", "1", "Malik", "Mehmet Açık", LOCAL, "0,00", "1.950,00", "0,00", "1.950,00"]) +
  row(["K BLOK", "1", "Kiracı", "Burak Açık", LOCAL, "750,00", "0,00", "0,00", "750,00"]) +
  row(["K BLOK", "1", "Eski Kiracı", "Eda Er", "", "300,00", "0,00", "100,00", "400,00"]) +
  row(["K BLOK", "2", "Malik", "Mehmet Açık", LOCAL, "500,00", "0,00", "0,00", "500,00"]) +
  `</table></body></html>`;
const PEOPLE_FILE = { fileName: "cari.xls", fileBase64: Buffer.from(PEOPLE_HTML, "utf8").toString("base64") };

describe.skipIf(!apiReachable)("veri aktarımı — kişi bazlı (malik / kiracı / eski kiracı)", () => {
  let mapping: Record<string, string> = {};
  let headerRow = 0;
  const createdUsers: string[] = [];

  afterAll(async () => {
    if (createdUsers.length) {
      await withBypassRls("test:gecis-people-cleanup", async (tx) => {
        for (const id of createdUsers) await tx.delete(users).where(eq(users.id, id));
      });
    }
  });

  it("önizleme: aynı daire tekrarı uyarı değil; ortak telefon uyarısı", async () => {
    const r = await site.call("POST", "/v1/panel/migrations/preview", PEOPLE_FILE);
    expect(r.status).toBe(201);
    const p = r.body as {
      personMode: boolean; headerRow: number; columns: Array<{ index: number; field: string }>;
      rows: Array<{ number: string; people: Array<{ role: string; former: boolean; name: string; hasPhone: boolean }> }>;
      issues: Array<{ code: string; severity: string }>;
      totals: { units: number; people: number; newPeople: number; formerTenants: number; errors: number; debtMinor: number };
    };
    expect(p.personMode).toBe(true);
    expect(p.totals).toMatchObject({ units: 2, people: 3, newPeople: 3, formerTenants: 1, errors: 0, debtMinor: 360_000 });
    expect(p.rows[0]!.people.map((x) => [x.role, x.former, x.name, x.hasPhone])).toEqual([
      ["owner", false, "Mehmet Açık", true],
      ["tenant", false, "Burak Açık", false],
      ["tenant", true, "Eda Er", false],
    ]);
    expect(p.issues.map((i) => i.code)).toEqual(["shared_phone"]);
    headerRow = p.headerRow;
    mapping = Object.fromEntries(p.columns.map((c) => [String(c.index), c.field]));
  });

  it("aktarım: kişiler, ilişkiler (eski kiracı kapalı), borç kişiye", async () => {
    const r = await site.call("POST", "/v1/panel/migrations", { ...PEOPLE_FILE, headerRow, mapping, carriedBalanceLabel: "Devir" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ units: 2, peopleCreated: 3, debts: 5, debtMinor: 360_000 });

    const check = await withBypassRls("test:gecis-people-check", async (tx) => {
      const unitRows = await tx.select({ id: units.id, number: units.number, owner: units.currentOwnerId, tenant: units.currentTenantId })
        .from(units).innerJoin(blocks, eq(blocks.id, units.blockId))
        .where(and(eq(units.tenantId, site.tenantId), eq(blocks.name, "K BLOK")));
      const occ = await tx.select({ unitId: unitOccupancies.unitId, userId: unitOccupancies.userId, relation: unitOccupancies.relation, endDate: unitOccupancies.endDate, policy: unitOccupancies.debtTransferPolicy })
        .from(unitOccupancies).where(eq(unitOccupancies.tenantId, site.tenantId));
      const people = await tx.select({ id: users.id, first: users.firstName, last: users.lastName, phone: users.phone })
        .from(users).where(inArray(users.id, occ.map((o) => o.userId)));
      const debtRows = await tx.select({ unitId: debts.unitId, debtor: debts.debtorUserId, kind: debts.kind, amount: debts.amountKurus })
        .from(debts).where(and(eq(debts.tenantId, site.tenantId), inArray(debts.unitId, unitRows.map((u) => u.id))));
      return { unitRows, occ, people, debtRows };
    });
    const byName = new Map(check.people.map((p) => [`${p.first} ${p.last}`, p]));
    const mehmet = byName.get("Mehmet Açık")!;
    const burak = byName.get("Burak Açık")!;
    const eda = byName.get("Eda Er")!;
    createdUsers.push(mehmet.id, burak.id, eda.id);
    expect(mehmet.phone).toBe(PHONE);
    expect(burak.phone).toBeNull();

    const k1 = check.unitRows.find((u) => u.number === "1")!;
    const k2 = check.unitRows.find((u) => u.number === "2")!;
    expect(k1).toMatchObject({ owner: mehmet.id, tenant: burak.id });
    expect(k2.owner).toBe(mehmet.id);
    const edaOcc = check.occ.find((o) => o.userId === eda.id)!;
    expect(edaOcc.relation).toBe("tenant");
    expect(edaOcc.endDate).not.toBeNull();
    expect(edaOcc.policy).toBe("keep");

    const sum = (u: string, who: string) => check.debtRows.filter((d) => d.unitId === u && d.debtor === who).reduce((s, d) => s + d.amount, 0);
    expect(sum(k1.id, mehmet.id)).toBe(195_000);
    expect(sum(k1.id, burak.id)).toBe(75_000);
    expect(sum(k1.id, eda.id)).toBe(40_000);
    expect(sum(k2.id, mehmet.id)).toBe(50_000);
  });

  it("ikinci kez: kişi ve borç ikizlenmez", async () => {
    const pre = await site.call("POST", "/v1/panel/migrations/preview", { ...PEOPLE_FILE, headerRow, mapping });
    expect((pre.body as { totals: { newPeople: number } }).totals.newPeople).toBe(0);
    const r = await site.call("POST", "/v1/panel/migrations", { ...PEOPLE_FILE, headerRow, mapping, carriedBalanceLabel: "Devir" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ units: 0, peopleCreated: 0, debts: 0, withBalance: 2 });
  });
});
