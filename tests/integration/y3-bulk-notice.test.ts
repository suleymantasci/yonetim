import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { fillNotice } from "@yonetim/contracts";
import { closeDb, notifications, unitOccupancies, users, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/** Y3 toplu bildirim: alıcı kuralları, kişi başı şablon, kanallar, rapora yansıma. */
let site: TestSite;

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("y3", 2);
  await withBypassRls("t", async (tx) => {
    await tx.update(users).set({ email: "malik1@example.com" }).where(eq(users.id, site.ownerIds[0]!));
  });
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("t", (tx) => tx.delete(notifications).where(eq(notifications.tenantId, site.tenantId)));
    await site.cleanup();
  }
  await closeDb();
});

type R = { userId: string; debtMinor: number; tenantName: string | null; hasEmail: boolean };
const preview = async (body: Record<string, unknown>) =>
  ((await site.call("POST", "/v1/panel/notices/preview", body)).body.recipients as R[]);

describe("şablon", () => {
  it("yer tutucular", () => {
    expect(fillNotice("Sayın {ad}, {daire}: {borc} {yok}", { ad: "A", daire: "1", borc: "₺5,00" })).toBe("Sayın A, 1: ₺5,00 {yok}");
  });
});

describe.skipIf(!apiReachable)("toplu bildirim", () => {
  it("metin: varsayılan aktif kişiler; taşınan kiracı dışarıda", async () => {
    expect((await preview({ kind: "text" })).length).toBe(3);
    await withBypassRls("t", (tx) =>
      tx.update(unitOccupancies).set({ endDate: new Date() }).where(eq(unitOccupancies.userId, site.tenantResidentId)),
    );
    const after = await preview({ kind: "text" });
    expect(after.map((r) => r.userId).sort()).toEqual([...site.ownerIds].sort());
    expect((await preview({ kind: "text", member: "former_tenant" })).map((r) => r.userId)).toEqual([site.tenantResidentId]);
  });

  it("borç durumu ve maliklere kiracı borcu", async () => {
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[0], kind: "dues", description: "Kiracı aidatı", amountMinor: 30_000, dueDate: "2026-09-10T09:00:00.000Z", shareTarget: "tenant" }).catch(() => null);
    // Kiracı ilişkisi bitti; borcu doğrudan kiracıya yaz.
    await site.call("POST", "/v1/panel/debts", { unitId: site.unitIds[1], kind: "dues", description: "Malik aidatı", amountMinor: 10_000, dueDate: "2026-09-10T09:00:00.000Z", shareTarget: "owner" });
    const debt = await preview({ kind: "debt" });
    expect(debt.find((r) => r.userId === site.ownerIds[1])!.debtMinor).toBe(10_000);
    expect((await preview({ kind: "debt", minTotal: 20_000 })).some((r) => r.userId === site.ownerIds[1])).toBe(false);
  });

  it("gönder: uygulama içi + e-posta; e-postası olmayan atlanır; rapora düşer", async () => {
    const res = await site.call("POST", "/v1/panel/notices/send", {
      kind: "text", subject: "{site} duyurusu", body: "Sayın {ad}, {daire} için not.", channels: ["in_app", "email"],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ recipients: 2, inApp: 2, emailSent: 1, emailSkipped: 1, emailFailed: 0 });
    const rows = await withBypassRls("t", (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.tenantId, site.tenantId), eq(notifications.userId, site.ownerIds[0]!))),
    );
    const inApp = rows.find((r) => r.channel === "in_app")!;
    expect(inApp.body).toBe("Sayın Malik1 y3, A / 1 için not.");
    expect(rows.some((r) => r.channel === "email" && r.recipient === "malik1@example.com")).toBe(true);
    const report = await site.call("GET", `/v1/panel/reports/debts/messages?from=2026-01-01&to=${new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)}&channel=email`);
    expect((report.body.rows as unknown[]).length).toBe(1);
    expect((await site.call("POST", "/v1/panel/notices/send", { kind: "text", subject: "x x", body: "y y", channels: ["sms"] })).status).toBe(422);
    expect((await site.call("POST", "/v1/panel/notices/send", { kind: "text", subject: "x x", body: "y y", channels: ["in_app"] }, site.ownerCookie)).status).toBe(403);
  });
});
