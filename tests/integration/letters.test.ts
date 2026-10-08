import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { auditLogs, closeDb, memberships, sessions, unitOccupancies, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Yazışma alıcıları ve tebligat süzgeçleri. Site: daire 1 = malik + kiracı,
 * daire 2 = malik; personel (staff) telefon isteyemez.
 */
let site: TestSite;
const STAFF = randomUUID();
let staffCookie = "";
type R = { unitId: string; people: { userId: string; relation: string; former: boolean; phone: string | null }[] }[];

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("evrak", 2);
  await withBypassRls("t", async (tx) => {
    await tx.insert(users).values({ id: STAFF, firstName: "Kapı", lastName: "Görevlisi", phone: `+90553${String(Date.now()).slice(-7)}`, locale: "tr" });
    await tx.insert(memberships).values({ tenantId: site.tenantId, userId: STAFF, role: "staff", acceptedAt: new Date() });
  });
  staffCookie = `${SESSION_COOKIE}=${(await createSession({ userId: STAFF, tenantId: site.tenantId })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("t", (tx) => tx.delete(sessions).where(eq(sessions.userId, STAFF)));
    await site.cleanup();
    await withBypassRls("t", (tx) => tx.delete(users).where(eq(users.id, STAFF)));
  }
  await closeDb();
});

describe.skipIf(!apiReachable)("yazışma alıcıları", () => {
  it("malik kapsamı: her dairede yalnız malik; telefon istenmedikçe yok", async () => {
    const res = await site.call("GET", "/v1/panel/letters/recipients?member=owner");
    const rows = res.body.rows as R;
    expect(rows.map((r) => r.unitId)).toEqual(site.unitIds);
    expect(rows.flatMap((r) => r.people.map((p) => p.userId))).toEqual(site.ownerIds);
    expect(rows[0]!.people[0]!.phone).toBeNull();
  });

  it("telefon: yönetici alır ve denetim kaydı düşer; personel 403", async () => {
    const res = await site.call("GET", "/v1/panel/letters/recipients?member=owner&phones=1");
    expect((res.body.rows as R)[0]!.people[0]!.phone).toMatch(/^\+90/);
    const logs = await withBypassRls("t", (tx) =>
      tx.select().from(auditLogs).where(and(eq(auditLogs.tenantId, site.tenantId), eq(auditLogs.action, "recipient_phones_exported"))),
    );
    expect(logs.length).toBe(1);
    const staff = await site.call("GET", "/v1/panel/letters/recipients?phones=1", undefined, staffCookie);
    expect(staff.status).toBe(403);
  });

  it("eski kiracı kapsamı: taşınan kiracı (E) olarak", async () => {
    await withBypassRls("t", (tx) =>
      tx.update(unitOccupancies).set({ endDate: new Date() }).where(eq(unitOccupancies.userId, site.tenantResidentId)),
    );
    const rows = (await site.call("GET", "/v1/panel/letters/recipients?member=former_tenant")).body.rows as R;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.people).toEqual([expect.objectContaining({ userId: site.tenantResidentId, former: true, relation: "tenant" })]);
  });

  it("tebligat süzgeçleri: dönem ≤, en az tutar, blok", async () => {
    const mk = (unitId: string, period: string, amountMinor: number) =>
      site.call("POST", "/v1/panel/debts", { unitId, kind: "dues", description: `Aidat ${period}`, amountMinor, period, dueDate: `${period}-10T09:00:00.000Z`, shareTarget: "owner" });
    await mk(site.unitIds[0]!, "2026-01", 30_000);
    await mk(site.unitIds[0]!, "2026-05", 30_000);
    await mk(site.unitIds[1]!, "2026-01", 10_000);
    const q = async (qs: string) =>
      ((await site.call("GET", `/v1/panel/reports/debts/open-items?${qs}`)).body as { units: { unitId: string; totalMinor: number; debtors: string[] }[] }).units;
    const until = await q("periodUntil=2026-03");
    expect(until.map((u) => [u.unitId, u.totalMinor])).toEqual([[site.unitIds[0], 30_000], [site.unitIds[1], 10_000]]);
    const min = await q("minTotal=50000");
    expect(min.map((u) => u.unitId)).toEqual([site.unitIds[0]]);
    expect(min[0]!.debtors[0]).toContain("Malik1");
    expect((await site.call("GET", "/v1/panel/reports/debts/open-items?periodUntil=2026-13")).status).toBe(422);
  });
});
