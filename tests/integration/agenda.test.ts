import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import { agendaItems, closeDb, memberships, notifications, sessions, users, withBypassRls } from "@yonetim/db";
import { agendaReminders } from "@yonetim/jobs";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Ajanda: kişisel/paylaşılan görünürlük, daire süzgeci, sakine kapalı;
 * hatırlatma işi sahibine (paylaşılanda yöneticilere de) bir kez yazar,
 * tamamlanan göreve yazmaz, tarih değişince yeniden yazar.
 */
let site: TestSite;
const OTHER = randomUUID();
let otherCookie = "";

const rows = (body: Record<string, unknown>) =>
  (body.rows as { id: string; title: string; mine: boolean; unitLabel: string | null; time: string | null }[]) ?? [];
const reminderTo = (itemId: string) =>
  withBypassRls("t", (tx) =>
    tx
      .select({ userId: notifications.userId, template: notifications.template })
      .from(notifications)
      .where(and(eq(notifications.resourceType, "agenda"), eq(notifications.resourceId, itemId))),
  );

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("ajanda", 2);
  await withBypassRls("test:agenda-setup", async (tx) => {
    await tx.insert(users).values({
      id: OTHER, firstName: "İkinci", lastName: "Yönetici",
      phone: `+90554${String(Date.now()).slice(-7)}`, locale: "tr",
    });
    await tx.insert(memberships).values({ tenantId: site.tenantId, userId: OTHER, role: "manager", acceptedAt: new Date() });
  });
  otherCookie = `${SESSION_COOKIE}=${(await createSession({ userId: OTHER, tenantId: site.tenantId })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:agenda-cleanup", async (tx) => {
      await tx.delete(notifications).where(eq(notifications.tenantId, site.tenantId));
      await tx.delete(agendaItems).where(eq(agendaItems.tenantId, site.tenantId));
      await tx.delete(sessions).where(eq(sessions.userId, OTHER));
    });
    await site.cleanup();
    await withBypassRls("test:agenda-cleanup-user", (tx) => tx.delete(users).where(eq(users.id, OTHER)));
  }
  await closeDb();
});

describe.skipIf(!apiReachable)("ajanda", () => {
  let privateId = "";
  let sharedId = "";

  it("kişisel kayıt yalnız sahibine, paylaşılan ekibe görünür", async () => {
    const p = await site.call("POST", "/v1/panel/agenda", {
      kind: "task", title: "Asansör firmasını ara", day: "2026-11-03", time: "14:30", remind: true,
      unitId: site.unitIds[0],
    });
    expect(p.status).toBe(201);
    privateId = p.body.id as string;
    const s = await site.call("POST", "/v1/panel/agenda", {
      kind: "note", title: "Çatı kontrolü", day: "2026-11-05", remind: true, shared: true,
    });
    sharedId = s.body.id as string;

    const mine = await site.call("GET", "/v1/panel/agenda?from=2026-11-01&to=2026-11-30");
    expect(rows(mine.body).map((r) => r.title).sort()).toEqual(["Asansör firmasını ara", "Çatı kontrolü"]);
    const first = rows(mine.body).find((r) => r.id === privateId)!;
    expect(first.time).toBe("14:30");
    expect(first.unitLabel).toBe("A / 1");

    const other = await site.call("GET", "/v1/panel/agenda?from=2026-11-01&to=2026-11-30", undefined, otherCookie);
    expect(rows(other.body).map((r) => r.id)).toEqual([sharedId]);
    expect(rows(other.body)[0]!.mine).toBe(false);
    // Başkasının kişisel kaydı: varlığı bile sızmasın.
    expect((await site.call("GET", `/v1/panel/agenda/${privateId}`, undefined, otherCookie)).status).toBe(404);
    expect((await site.call("DELETE", `/v1/panel/agenda/${privateId}`, undefined, otherCookie)).status).toBe(404);
  });

  it("daire süzgeci ve sakine kapalı", async () => {
    const filtered = await site.call("GET", `/v1/panel/agenda?from=2026-11-01&to=2026-11-30&unitId=${site.unitIds[1]}`);
    expect(rows(filtered.body)).toHaveLength(0);
    expect((await site.call("GET", "/v1/panel/agenda?from=2026-11-01&to=2026-11-30", undefined, site.ownerCookie)).status).toBe(403);
  });

  it("tarihsiz not üst bar listesinde, takvimde yok", async () => {
    await site.call("POST", "/v1/panel/agenda", { kind: "note", title: "Tarihsiz fikir" });
    const notes = await site.call("GET", "/v1/panel/agenda/notes");
    expect(rows(notes.body).map((r) => r.title)).toContain("Tarihsiz fikir");
    const bad = await site.call("POST", "/v1/panel/agenda", { kind: "task", title: "Günsüz hatırlatma", remind: true });
    expect(bad.status).toBe(422);
  });

  it("hatırlatma: zamanı gelince bir kez; paylaşılan yöneticilere de", async () => {
    // 2026-11-03 14:30 İstanbul = 11:30Z
    const early = await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-03T11:29:00Z") });
    expect(early.items).toBe(0);
    const due = await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-03T11:31:00Z") });
    expect(due.items).toBe(1);
    expect((await reminderTo(privateId)).map((r) => r.userId)).toEqual([site.managerId]);
    // İkinci koşu yeniden yazmaz.
    expect((await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-03T12:00:00Z") })).notified).toBe(0);

    // Paylaşılan not 09:00'da (saat verilmedi) iki yöneticiye.
    await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-05T06:01:00Z") });
    expect((await reminderTo(sharedId)).map((r) => r.userId).sort()).toEqual([site.managerId, OTHER].sort());
  });

  it("tarihi değişen kayıt yeniden hatırlatılır; tamamlanan görev hatırlatılmaz", async () => {
    const moved = await site.call("PATCH", `/v1/panel/agenda/${privateId}`, {
      kind: "task", title: "Asansör firmasını ara", day: "2026-11-10", time: "10:00", remind: true,
    });
    expect(moved.status).toBe(200);
    await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-10T07:05:00Z") });
    expect(await reminderTo(privateId)).toHaveLength(2);

    const task = await site.call("POST", "/v1/panel/agenda", {
      kind: "task", title: "Yapıldı bile", day: "2026-11-12", time: "08:00", remind: true,
    });
    const doneId = task.body.id as string;
    await site.call("POST", `/v1/panel/agenda/${doneId}/done`, { done: true });
    const r = await agendaReminders({ tenantId: site.tenantId, now: new Date("2026-11-12T06:00:00Z") });
    expect(r.items).toBe(1);
    expect(r.notified).toBe(0);
    const [row] = await withBypassRls("t", (tx) =>
      tx.select({ remindedAt: agendaItems.remindedAt }).from(agendaItems).where(eq(agendaItems.id, doneId)),
    );
    expect(row!.remindedAt).not.toBeNull();
    expect(
      await withBypassRls("t", (tx) =>
        tx.select().from(notifications).where(and(eq(notifications.resourceId, doneId), like(notifications.template, "agenda_%"))),
      ),
    ).toHaveLength(0);
  });
});
