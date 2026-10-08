import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, debts, duesPlans, units, withBypassRls } from "@yonetim/db";
import { applyLateFees, generateDuesForTenant } from "@yonetim/jobs";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Borç türleri: varsayılanlar, CRUD, borçlu kuralı (oturan/malik + "aidatı
 * maliğe yaz" istisnası), toplu borçlandırmada tür bazında "zaten var",
 * gecikme işinde tür başına mod/oran ve muafiyetler, aidat planı üretimi.
 * Site: daire 1 = malik + kiracı, daire 2 = yalnız malik.
 */
let site: TestSite;

type TypeRow = { id: string; name: string; debtor: string; lateFeeMode: string; debtCount: number; isActive: boolean };
const types = async () => (await site.call("GET", "/v1/panel/debt-types")).body.rows as TypeRow[];
const byName = async (name: string) => (await types()).find((t) => t.name === name)!;
const debtRows = (unitId: string) =>
  withBypassRls("t", (tx) => tx.select().from(debts).where(eq(debts.unitId, unitId)));

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("borc-turu", 2);
});

afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

describe.skipIf(!apiReachable)("borç türleri", () => {
  it("yeni sitede varsayılan türler ilk okumada oluşur", async () => {
    const rows = await types();
    expect(rows.map((r) => r.name)).toEqual([
      "Aidat", "Yakıt", "Demirbaş", "Ek gider", "Kira", "Depozito", "İdari ceza",
    ]);
    expect(rows.find((r) => r.name === "Demirbaş")!.debtor).toBe("owner");
    // İkinci okuma çoğaltmaz.
    expect(await types()).toHaveLength(7);
  });

  it("ekle / aynı ad 409 / güncelle / geçersiz oran 422", async () => {
    const body = { name: "Asansör fonu", baseKind: "extra", debtor: "owner", lateFeeMode: "daily", lateFeeMonthlyPct: 2, accountCode: "602.10" };
    const created = await site.call("POST", "/v1/panel/debt-types", body);
    expect(created.status).toBe(201);
    const dup = await site.call("POST", "/v1/panel/debt-types", { ...body, name: "asansör FONU" });
    expect(dup.status).toBe(409);
    const bad = await site.call("POST", "/v1/panel/debt-types", { ...body, name: "X fonu", lateFeeMonthlyPct: 9 });
    expect(bad.status).toBe(422);
    const upd = await site.call("PATCH", `/v1/panel/debt-types/${created.body.id}`, { ...body, debtor: "occupant" });
    expect(upd.status).toBe(200);
    expect((await byName("Asansör fonu")).debtor).toBe("occupant");
    // Malik/sakin türleri değiştiremez.
    const owner = await site.call("POST", "/v1/panel/debt-types", { ...body, name: "Y" }, site.ownerCookie);
    expect(owner.status).toBe(403);
  });

  it("türün kuralı: demirbaş maliğe, aidat oturana (kiracıya)", async () => {
    const demirbas = await byName("Demirbaş");
    const aidat = await byName("Aidat");
    const base = { unitId: site.unitIds[0], description: "Test borcu", amountMinor: 10_000, dueDate: "2026-09-10T00:00:00.000Z", shareTarget: "rule" };
    const d1 = await site.call("POST", "/v1/panel/debts", { ...base, debtTypeId: demirbas.id });
    expect(d1.status).toBe(201);
    const d2 = await site.call("POST", "/v1/panel/debts", { ...base, debtTypeId: aidat.id });
    const rows = await debtRows(site.unitIds[0]!);
    const r1 = rows.find((r) => r.id === (d1.body.ids as string[])[0])!;
    const r2 = rows.find((r) => r.id === (d2.body.ids as string[])[0])!;
    expect(r1.debtorUserId).toBe(site.ownerIds[0]);
    expect(r1.kind).toBe("extra");
    expect(r1.debtTypeId).toBe(demirbas.id);
    expect(r2.debtorUserId).toBe(site.tenantResidentId);
    expect(r2.kind).toBe("dues");
  });

  it("daire istisnası: aidatı maliğe yaz — yakıt oturanda kalır", async () => {
    await withBypassRls("t", (tx) => tx.update(units).set({ ownerPaysDues: true }).where(eq(units.id, site.unitIds[0]!)));
    const base = { unitId: site.unitIds[0], description: "İstisna", amountMinor: 5_000, dueDate: "2026-09-10T00:00:00.000Z", shareTarget: "rule" };
    const a = await site.call("POST", "/v1/panel/debts", { ...base, debtTypeId: (await byName("Aidat")).id });
    const y = await site.call("POST", "/v1/panel/debts", { ...base, debtTypeId: (await byName("Yakıt")).id });
    const rows = await debtRows(site.unitIds[0]!);
    expect(rows.find((r) => r.id === (a.body.ids as string[])[0])!.debtorUserId).toBe(site.ownerIds[0]);
    expect(rows.find((r) => r.id === (y.body.ids as string[])[0])!.debtorUserId).toBe(site.tenantResidentId);
    await withBypassRls("t", (tx) => tx.update(units).set({ ownerPaysDues: false }).where(eq(units.id, site.unitIds[0]!)));
  });

  it("pasif tür yeni borçta reddedilir; bağlı borcu olan tür silinmez", async () => {
    const kira = await byName("Kira");
    await site.call("PATCH", `/v1/panel/debt-types/${kira.id}`, { name: "Kira", baseKind: "rent", debtor: "occupant", lateFeeMode: "monthly", isActive: false });
    const res = await site.call("POST", "/v1/panel/debts", {
      unitId: site.unitIds[1], debtTypeId: kira.id, description: "Kira", amountMinor: 100, dueDate: "2026-09-10T00:00:00.000Z", shareTarget: "rule",
    });
    expect(res.status).toBe(400);
    const demirbas = await byName("Demirbaş");
    expect(demirbas.debtCount).toBeGreaterThan(0);
    expect((await site.call("DELETE", `/v1/panel/debt-types/${demirbas.id}`)).status).toBe(409);
    const unused = await byName("Depozito");
    expect((await site.call("DELETE", `/v1/panel/debt-types/${unused.id}`)).status).toBe(200);
    expect((await types()).some((t) => t.name === "Depozito")).toBe(false);
  });

  it("toplu borçlandırma: 'zaten var' türe göre — aynı sınıftaki başka tür engellemez", async () => {
    const ek = await byName("Ek gider");
    const demirbas = await byName("Demirbaş");
    const bulk = (debtTypeId: string) => ({
      description: "Çatı", debtTypeId, period: "2026-10", dueDay: 10, formula: "equal", amountMinor: 1_000,
      shareTarget: "rule", blockIds: [], unitTypes: [], skipExisting: true, lateFeeExempt: false,
    });
    const first = await site.call("POST", "/v1/panel/debts/bulk", bulk(ek.id));
    expect(first.status).toBe(201);
    expect(first.body.createdCount).toBe(2);
    const again = await site.call("POST", "/v1/panel/debts/bulk/preview", bulk(ek.id));
    expect((again.body.rows as { alreadyExists: boolean }[]).every((r) => r.alreadyExists)).toBe(true);
    const other = await site.call("POST", "/v1/panel/debts/bulk/preview", bulk(demirbas.id));
    expect((other.body.rows as { alreadyExists: boolean }[]).some((r) => r.alreadyExists)).toBe(false);
    // Ek gider oturana: daire 1 kiracıya.
    const rows = await debtRows(site.unitIds[0]!);
    expect(rows.find((r) => r.debtTypeId === ek.id)!.debtorUserId).toBe(site.tenantResidentId);
  });

  it("gecikme işi: tür 'işlemez' ise sıfır, günlük türde kıst, borç muafiyetinde sıfır", async () => {
    const none = await site.call("POST", "/v1/panel/debt-types", { name: "Gecikmesiz", baseKind: "extra", debtor: "owner", lateFeeMode: "none" });
    const daily = await site.call("POST", "/v1/panel/debt-types", { name: "Günlük", baseKind: "extra", debtor: "owner", lateFeeMode: "daily", lateFeeMonthlyPct: 3 });
    const mk = async (debtTypeId: string, lateFeeExempt = false) =>
      ((await site.call("POST", "/v1/panel/debts", {
        unitId: site.unitIds[1], debtTypeId, description: "Gecikme testi", amountMinor: 100_000,
        dueDate: "2026-01-10T00:00:00.000Z", shareTarget: "rule", lateFeeExempt,
      })).body.ids as string[])[0]!;
    const idNone = await mk(none.body.id as string);
    const idDaily = await mk(daily.body.id as string);
    const idExempt = await mk(daily.body.id as string, true);
    await applyLateFees({ tenantId: site.tenantId, asOf: new Date("2026-01-25T00:00:00.000Z") });
    const rows = await debtRows(site.unitIds[1]!);
    const fee = (id: string) => rows.find((r) => r.id === id)!.lateFeeKurus;
    expect(fee(idNone)).toBe(0);
    expect(fee(idDaily)).toBe(1_500); // 100.000 × %3 × 15/30
    expect(fee(idExempt)).toBe(0);
  });

  it("aidat planı üretimi Aidat türüne bağlanır ve istisnaya uyar", async () => {
    await withBypassRls("t", async (tx) => {
      await tx.update(units).set({ currentOwnerId: site.ownerIds[0], currentTenantId: site.tenantResidentId, ownerPaysDues: true })
        .where(eq(units.id, site.unitIds[0]!));
      await tx.update(units).set({ currentOwnerId: site.ownerIds[1] }).where(eq(units.id, site.unitIds[1]!));
      await tx.insert(duesPlans).values({
        tenantId: site.tenantId, name: "Aylık aidat", formula: "equal", baseAmountKurus: 50_000, startPeriod: "2026-01",
      });
    });
    const res = await generateDuesForTenant({ tenantId: site.tenantId, period: { year: 2026, month: 11 } });
    expect(res.find((r) => !r.skipped)?.generated).toBe(2);
    const aidat = await byName("Aidat");
    const rows = await withBypassRls("t", (tx) =>
      tx.select().from(debts).where(and(eq(debts.tenantId, site.tenantId), eq(debts.period, "2026-11"))),
    );
    expect(rows.every((r) => r.debtTypeId === aidat.id)).toBe(true);
    expect(rows.find((r) => r.unitId === site.unitIds[0])!.debtorUserId).toBe(site.ownerIds[0]);
  });
});
