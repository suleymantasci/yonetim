import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, unitOccupancies, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Eski üye ayrımı: borç listesi, sakin listesi ve hesap özeti aynı kapsam
 * tanımıyla süzülür. Site: daire 1 = malik + kiracı, daire 2 = malik.
 * Kiracı taşındırılınca (ilişki bitince) "eski kiracı" olur; borcu kalır.
 */
let site: TestSite;
const ids = (body: Record<string, unknown>) => (body.rows as { id: string }[]).map((r) => r.id);

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("eski-uye", 2);
});

afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("üye kapsamı süzgeci", () => {
  let tenantDebt = "";
  let ownerDebt = "";

  it("kiracı ve malik borçları; kiracı taşınınca eski kiracı olur", async () => {
    const mk = async (unitId: string, shareTarget: string, description: string) =>
      ((await site.call("POST", "/v1/panel/debts", {
        unitId, kind: "dues", description, amountMinor: 1_000, dueDate: "2026-09-10T00:00:00.000Z", shareTarget,
      })).body.ids as string[])[0]!;
    tenantDebt = await mk(site.unitIds[0]!, "tenant", "Kiracı aidatı");
    ownerDebt = await mk(site.unitIds[1]!, "owner", "Malik aidatı");

    const before = await site.call("GET", "/v1/panel/debts?member=tenant&perPage=50");
    expect(ids(before.body)).toEqual([tenantDebt]);
    expect((before.body.rows as { debtorRelation: string }[])[0]!.debtorRelation).toBe("tenant");

    await withBypassRls("t", (tx) =>
      tx.update(unitOccupancies).set({ endDate: new Date("2026-09-30") })
        .where(and(eq(unitOccupancies.userId, site.tenantResidentId), eq(unitOccupancies.unitId, site.unitIds[0]!))),
    );
  });

  it("borç listesi: eski kiracı / kiracı / malik / oturan", async () => {
    const q = async (member: string) => ids((await site.call("GET", `/v1/panel/debts?member=${member}&perPage=50`)).body);
    expect(await q("former_tenant")).toEqual([tenantDebt]);
    expect(await q("tenant")).toEqual([]);
    expect(await q("owner")).toEqual([ownerDebt]);
    // Daire 1 artık kiracısız: maliği oturan; daire 2'nin maliği zaten oturan.
    expect(await q("occupant")).toEqual([ownerDebt]);
    expect((await q("all")).sort()).toEqual([ownerDebt, tenantDebt].sort());
    const row = ((await site.call("GET", "/v1/panel/debts?member=former_tenant")).body.rows as { debtorRelation: string }[])[0]!;
    expect(row.debtorRelation).toBe("former_tenant");
    expect((await site.call("GET", "/v1/panel/debts?member=bogus")).status).toBe(422);
  });

  it("sakin listesi: eski kiracı süzgeci ve (E) ilişkisi", async () => {
    const res = await site.call("GET", "/v1/panel/residents?member=former_tenant&perPage=50");
    const rows = res.body.rows as { userId: string; occupancies: { former: boolean; relation: string }[] }[];
    expect(rows.map((r) => r.userId)).toEqual([site.tenantResidentId]);
    expect(rows[0]!.occupancies).toEqual([expect.objectContaining({ relation: "tenant", former: true })]);
    const owners = await site.call("GET", "/v1/panel/residents?member=owner&perPage=50");
    expect((owners.body.rows as { userId: string }[]).map((r) => r.userId).sort()).toEqual([...site.ownerIds].sort());
  });

  it("hesap özeti: eski kiracı kapsamı yalnız onun borcunu ve adını verir", async () => {
    const res = await site.call(
      "GET",
      "/v1/panel/reports/accounting/unit-statements?from=2026-01-01&to=2026-12-31&member=former_tenant",
    );
    expect(res.status).toBe(200);
    const rows = res.body.rows as { unitId: string; holder: string | null; chargedMinor: number }[];
    expect(rows.map((r) => r.unitId)).toEqual([site.unitIds[0]]);
    expect(rows[0]!.chargedMinor).toBe(1_000);
    expect(rows[0]!.holder).toContain("Kiracı");
  });
});
