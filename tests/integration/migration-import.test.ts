import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { blocks, closeDb, debts, migrationJobs, tenants, units, withBypassRls } from "@yonetim/db";

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
    expect(p.totals.byKind).toEqual({ dues: 125_000, utility: 25_000, late_fee: 0, extra: 40_000 });
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
