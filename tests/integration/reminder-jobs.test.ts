import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  blocks, closeDb, debts, documents, meetings, memberships, notifications, requests, tenants, units, users,
  withBypassRls,
} from "@yonetim/db";
import { documentExpiry, duesLateWarning, duesReminder, legalEscalation, meetingReminders, slaBreachCheck } from "@yonetim/jobs";

/** Hatırlatma işleri: SLA ihlali, toplantı, belge süresi, borç hatırlatma/uyarı. */
const RUN = process.env.INTEGRATION === "1";
const DAY = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00Z");
const T = randomUUID();
const MANAGER = randomUUID();
const OWNER = randomUUID();
let unitId = "";

const notes = (template: string) =>
  withBypassRls("t", (tx) =>
    tx.select({ userId: notifications.userId }).from(notifications)
      .where(and(eq(notifications.tenantId, T), eq(notifications.template, template))),
  );

beforeAll(async () => {
  if (!RUN) return;
  const s = String(Date.now()).slice(-5);
  await withBypassRls("test:reminders-setup", async (tx) => {
    await tx.insert(tenants).values({ id: T, slug: `hatirlatma-${s}`, name: "Hatırlatma", type: "apartment", unitCount: 1, status: "active", settings: {} });
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Y", lastName: "Müdür", phone: `+9055516${s}`, locale: "tr" },
      { id: OWNER, firstName: "M", lastName: "Malik", phone: `+9055517${s}`, locale: "en" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: T, userId: MANAGER, role: "manager", acceptedAt: NOW },
      { tenantId: T, userId: OWNER, role: "owner", acceptedAt: NOW },
    ]);
    const [b] = await tx.insert(blocks).values({ tenantId: T, name: "A", floorCount: 1, unitCount: 1 }).returning({ id: blocks.id });
    const [u] = await tx.insert(units).values({ tenantId: T, blockId: b!.id, number: "1", floor: 1, type: "flat", areaM2: "80", landShare: "1" }).returning({ id: units.id });
    unitId = u!.id;
  });
});

afterAll(async () => {
  if (RUN) {
    await withBypassRls("test:reminders-cleanup", async (tx) => {
      for (const t of [notifications, debts, documents, meetings, requests, units, blocks, memberships]) {
        await tx.delete(t).where(eq((t as typeof notifications).tenantId, T));
      }
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(users).where(eq(users.id, OWNER));
      await tx.delete(tenants).where(eq(tenants.id, T));
    });
  }
  await closeDb();
});

describe.skipIf(!RUN)("sla.breach-check", () => {
  it("süresi dolan açık talebi bir kez işaretler ve yöneticiyi uyarır", async () => {
    await withBypassRls("t", (tx) => tx.insert(requests).values([
      { tenantId: T, code: "T-1", category: "ariza", title: "Asansör", slaDueAt: new Date(NOW.getTime() - 3600_000), status: "open" },
      { tenantId: T, code: "T-2", category: "ariza", title: "Çözüldü", slaDueAt: new Date(NOW.getTime() - 3600_000), status: "resolved" },
      { tenantId: T, code: "T-3", category: "ariza", title: "Henüz değil", slaDueAt: new Date(NOW.getTime() + 3600_000), status: "open" },
    ]));
    expect(await slaBreachCheck({ tenantId: T, now: NOW })).toMatchObject({ breached: 1, notified: 1 });
    // Yeniden koşu: ikinci kez işaretlenmez, bildirim çoğalmaz.
    expect(await slaBreachCheck({ tenantId: T, now: new Date(NOW.getTime() + 900_000) })).toMatchObject({ breached: 0, notified: 0 });
    expect((await notes("request_sla_breached")).map((n) => n.userId)).toEqual([MANAGER]);
  });
});

describe.skipIf(!RUN)("meetings.reminders", () => {
  it("içinde bulunulan eşik için bir kez bildirir (T-7), malik ve yöneticiye", async () => {
    await withBypassRls("t", (tx) => tx.insert(meetings).values([
      { tenantId: T, title: "Genel kurul", scheduledAt: new Date(NOW.getTime() + 6.5 * DAY), status: "planned" },
      { tenantId: T, title: "Uzak toplantı", scheduledAt: new Date(NOW.getTime() + 40 * DAY), status: "planned" },
      { tenantId: T, title: "İptal", scheduledAt: new Date(NOW.getTime() + 2 * DAY), status: "cancelled" },
    ]));
    const first = await meetingReminders({ tenantId: T, now: NOW });
    expect(first).toMatchObject({ meetings: 1, notified: 2 });
    expect((await meetingReminders({ tenantId: T, now: NOW })).notified).toBe(0);
    expect((await notes("meeting_reminder_t7")).map((n) => n.userId).sort()).toEqual([MANAGER, OWNER].sort());

    // 1 gün kala yeni eşik (t1) yazılır.
    const lastDay = await meetingReminders({ tenantId: T, now: new Date(NOW.getTime() + 5.7 * DAY) });
    expect(lastDay.notified).toBe(2);
    expect(await notes("meeting_reminder_t1")).toHaveLength(2);
  });
});

describe.skipIf(!RUN)("documents.expiry", () => {
  it("30 gün, 7 gün ve dolmuş eşiklerini belge başına bir kez yazar", async () => {
    await withBypassRls("t", (tx) => tx.insert(documents).values([
      { tenantId: T, title: "Asansör sözleşmesi", url: "x", expiresAt: new Date(NOW.getTime() + 20 * DAY) },
      { tenantId: T, title: "Poliçe", url: "x", expiresAt: new Date(NOW.getTime() + 3 * DAY) },
      { tenantId: T, title: "Eski ruhsat", url: "x", expiresAt: new Date(NOW.getTime() - 5 * DAY) },
      { tenantId: T, title: "Uzak", url: "x", expiresAt: new Date(NOW.getTime() + 200 * DAY) },
      { tenantId: T, title: "Çok eski", url: "x", expiresAt: new Date(NOW.getTime() - 500 * DAY) },
    ]));
    expect(await documentExpiry({ tenantId: T, now: NOW })).toMatchObject({ documents: 3, notified: 3 });
    expect((await documentExpiry({ tenantId: T, now: NOW })).notified).toBe(0);
    expect(await notes("document_expiry_30")).toHaveLength(1);
    expect(await notes("document_expiry_7")).toHaveLength(1);
    expect(await notes("document_expiry_expired")).toHaveLength(1);
  });
});

describe.skipIf(!RUN)("dues.reminder / dues.late-warning", () => {
  const debt = (dueIn: number, extra: Record<string, unknown> = {}) => ({
    tenantId: T, unitId, debtorUserId: OWNER, description: "Aidat", amountKurus: 50_000,
    dueDate: new Date(NOW.getTime() + dueIn * DAY), ...extra,
  });

  it("vadesine ~5 gün kalan açık borç için sakine hatırlatır", async () => {
    await withBypassRls("t", (tx) => tx.insert(debts).values([
      debt(4.5),
      debt(4.5, { status: "paid", paidKurus: 50_000 }),
      debt(10),
    ]));
    expect(await duesReminder({ tenantId: T, now: NOW })).toMatchObject({ debts: 1, notified: 1 });
    expect((await duesReminder({ tenantId: T, now: NOW })).notified).toBe(0);
    expect((await notes("dues_reminder_t5")).map((n) => n.userId)).toEqual([OWNER]);
  });

  it("vadesi 7 gün geçmiş açık borç için gecikme uyarısı yazar", async () => {
    await withBypassRls("t", (tx) => tx.insert(debts).values([debt(-7.5), debt(-3), debt(-7.5, { status: "paid", paidKurus: 50_000 })]));
    expect(await duesLateWarning({ tenantId: T, now: NOW })).toMatchObject({ notified: 1 });
    expect(await notes("dues_late_7")).toHaveLength(1);
  });
});

describe.skipIf(!RUN)("legal.escalate", () => {
  it("90+ gün gecikmiş açık borçları ayda bir özetler", async () => {
    await withBypassRls("t", (tx) => tx.insert(debts).values([
      { tenantId: T, unitId, debtorUserId: OWNER, description: "Eski", amountKurus: 40_000, dueDate: new Date(NOW.getTime() - 120 * DAY) },
      { tenantId: T, unitId, debtorUserId: OWNER, description: "Eski ödenmiş", amountKurus: 40_000, paidKurus: 40_000, status: "paid", dueDate: new Date(NOW.getTime() - 120 * DAY) },
      { tenantId: T, unitId, debtorUserId: OWNER, description: "Yeni", amountKurus: 40_000, dueDate: new Date(NOW.getTime() - 30 * DAY) },
    ]));
    expect(await legalEscalation({ tenantId: T, now: NOW })).toMatchObject({ candidates: 1, totalKurus: 40_000, notified: 1 });
    expect((await legalEscalation({ tenantId: T, now: NOW })).notified).toBe(0);
    expect(await notes("legal_escalate_2026-10")).toHaveLength(1);
  });
});
