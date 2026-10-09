import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { closeDb, memberships, sessions, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y1 makbuz numarası, Y2 üye listeleri ve borç süzgeçleri. */
let site: TestSite;
const ACCT = randomUUID();
let acctCookie = "";

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y12", 2);
  await withBypassRls("t", async (tx) => {
    await tx.insert(users).values({ id: ACCT, firstName: "Mali", lastName: "Müşavir", phone: `+90551${String(Date.now()).slice(-7)}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: site.tenantId, userId: ACCT, role: "accountant", acceptedAt: new Date() });
  });
  acctCookie = `${SESSION_COOKIE}=${(await createSession({ userId: ACCT, tenantId: site.tenantId })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("t", (tx) => tx.delete(sessions).where(eq(sessions.userId, ACCT)));
    await site.cleanup();
    await withBypassRls("t", (tx) => tx.delete(users).where(eq(users.id, ACCT)));
  }
  await closeDb();
});

const name = async () => ((await site.call("GET", "/v1/panel/settings")).body as { name: string }).name;

describe.skipIf(!apiReachable)("Y1 makbuz numarası", () => {
  it("otomatik: önek + sıradaki no; elle girilen öncelikli; sayaç geri çekilemez", async () => {
    expect((await site.call("PATCH", "/v1/panel/settings", { name: await name(), receiptAutoNumber: true, receiptPrefix: "M-", receiptNextNo: 7, receiptFooter: "Yönetim adına" })).status).toBe(200);
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Aidat", amountMinor: 10_000, dueDate: "2026-09-10T09:00:00.000Z", shareTarget: "owner" });
    const pay = (body: Record<string, unknown>) =>
      site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[0], amountMinor: 1_000, method: "cash", paidAt: new Date().toISOString(), ...body });
    await pay({});
    await pay({});
    await pay({ receiptNo: "EL-5" });
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const rec = (await site.call("GET", `/v1/panel/reports/debts/receipts?from=2026-01-01&to=${today}`)).body.rows as { receiptNo: string }[];
    expect(rec.map((r) => r.receiptNo).sort()).toEqual(["EL-5", "M-7", "M-8"]);
    await site.call("PATCH", "/v1/panel/settings", { name: await name(), receiptAutoNumber: true, receiptPrefix: "M-", receiptNextNo: 2 });
    const s = (await site.call("GET", "/v1/panel/settings")).body as { settings: { receipt: { nextNo: number } } };
    expect(s.settings.receipt.nextNo).toBe(9);
  });
});

describe.skipIf(!apiReachable)("Y2 listeler ve süzgeçler", () => {
  it("borç türü ve eşik süzgeci (daire ve sakin)", async () => {
    const types = (await site.call("GET", "/v1/panel/debt-types")).body.rows as { id: string; name: string }[];
    const yakit = types.find((t) => t.name === "Yakıt")!.id;
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[1], debtTypeId: yakit, description: "Yakıt", amountMinor: 60_000, dueDate: "2026-09-10T09:00:00.000Z", shareTarget: "owner" });
    const units = async (qs: string) => ((await site.call("GET", `/v1/panel/units?${qs}`)).body.rows as { id: string }[]).map((r) => r.id);
    expect(await units(`status=borclu&debtTypeId=${yakit}`)).toEqual([site.unitIds[1]]);
    expect(await units("minOutstanding=50000")).toEqual([site.unitIds[1]]);
    expect((await units("status=borcsuz")).length).toBe(0);
    const res = async (qs: string) => ((await site.call("GET", `/v1/panel/residents?${qs}`)).body.rows as { userId: string }[]).map((r) => r.userId);
    expect(await res(`status=inDebt&debtTypeId=${yakit}`)).toEqual([site.ownerIds[1]]);
    expect(await res("minOutstanding=50000")).toEqual([site.ownerIds[1]]);
    expect((await res("status=noDebt")).includes(site.tenantResidentId)).toBe(true);
  });

  it("ikamet, plaka, boş/dolu", async () => {
    await site.call("POST", `/v1/panel/units/${site.unitIds[0]}/household`, { fullName: "Can Malik", relation: "child" });
    await site.call("POST", `/v1/panel/units/${site.unitIds[0]}/vehicles`, { plate: "06 xy 99" });
    const hh = (await site.call("GET", "/v1/panel/lists/household")).body.rows as { fullName: string; relation: string }[];
    expect(hh.some((r) => r.fullName === "Can Malik" && r.relation === "child")).toBe(true);
    expect(hh.some((r) => r.relation === "self")).toBe(true);
    const onlyChildren = (await site.call("GET", "/v1/panel/lists/household?relation=child")).body.rows as { relation: string }[];
    expect(onlyChildren.every((r) => r.relation === "child")).toBe(true);
    const plates = (await site.call("GET", "/v1/panel/lists/vehicles")).body.rows as { plate: string; unitId: string }[];
    expect(plates).toEqual([expect.objectContaining({ plate: "06XY99", unitId: site.unitIds[0] })]);
    const none = (await site.call("GET", "/v1/panel/lists/vehicles?has=no")).body.rows as { unitId: string }[];
    expect(none.map((r) => r.unitId)).toEqual([site.unitIds[1]]);
    const occ = (await site.call("GET", "/v1/panel/lists/occupancy?state=occupied")).body.rows as { unitId: string; tenantName: string | null }[];
    expect(occ).toHaveLength(2);
    expect(occ[0]!.tenantName).toContain("Kiracı");
  });

  it("TC listesi maskeli; açık değer yalnız yöneticiye", async () => {
    const masked = await site.call("GET", "/v1/panel/lists/tckn");
    expect(masked.status).toBe(200);
    expect((await site.call("GET", "/v1/panel/lists/tckn?reveal=1", undefined, acctCookie)).status).toBe(403);
    expect((await site.call("GET", "/v1/panel/lists/tckn?reveal=1")).status).toBe(200);
  });

  it("detaylı döküm: seçilen sütunlar, telefon maskeli / açık", async () => {
    const d = (await site.call("GET", "/v1/panel/lists/detailed?columns=number,name,relation,phone&member=owner")).body as { columns: string[]; rows: string[][] };
    expect(d.columns).toEqual(["number", "name", "relation", "phone"]);
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0]![3]).toMatch(/\*/);
    const open = (await site.call("GET", "/v1/panel/lists/detailed?columns=phone&member=owner&reveal=1")).body as { rows: string[][] };
    expect(open.rows[0]![0]).toMatch(/^\+90\d+$/);
    expect((await site.call("GET", "/v1/panel/lists/detailed?columns=bogus")).status).toBe(422);
  });
});
