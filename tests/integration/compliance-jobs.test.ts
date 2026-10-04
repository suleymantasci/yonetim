import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

import {
  closeDb,
  kvkkRequests,
  memberships,
  notifications,
  subscriptions,
  plans,
  tenants,
  unitOccupancies,
  units,
  blocks,
  users,
  withBypassRls,
} from "@yonetim/db";
import { expireTrial, kvkkRequestSla, kvkkRetentionScan } from "@yonetim/jobs";

/**
 * Uyum işleri — deneme bitişi, KVKK başvuru süresi uyarısı, saklama taraması.
 * Doğrudan iş fonksiyonları çağrılıyor (worker kuyruğu olmadan).
 */
const RUN = process.env.INTEGRATION === "1";
const TENANT = { id: randomUUID(), slug: `uyum-${Date.now()}` };
const MANAGER = randomUUID();
const FORMER = randomUUID();
let requestId = "";

beforeAll(async () => {
  if (!RUN) return;
  const stamp = String(Date.now()).slice(-5);
  await withBypassRls("test:jobs-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id, slug: TENANT.slug, name: "Uyum İşleri Testi", type: "apartment",
      unitCount: 1, status: "trial", trialEndsAt: new Date(Date.now() - 86_400_000), settings: {},
    });
    const [plan] = await tx.select({ id: plans.id }).from(plans).limit(1);
    if (plan) {
      await tx.insert(subscriptions).values({
        tenantId: TENANT.id, planId: plan.id, status: "trialing", priceKurus: 0, listPriceKurus: 0,
      });
    }
    const [block] = await tx.insert(blocks).values({ tenantId: TENANT.id, name: "A", floorCount: 1, unitCount: 1 }).returning({ id: blocks.id });
    const [unit] = await tx.insert(units).values({
      tenantId: TENANT.id, blockId: block!.id, number: "1", floor: 1, type: "flat", areaM2: "80", landShare: "1",
    }).returning({ id: units.id });
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Yönetici", lastName: "Uyum", phone: `+9055507${stamp}`, locale: "tr" },
      { id: FORMER, firstName: "Eski", lastName: "Sakin", phone: `+9055508${stamp}`, locale: "tr" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: TENANT.id, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      // 3 yıl önce ayrılmış sakin — saklama süresi (2 yıl) dolmuş.
      { tenantId: TENANT.id, userId: FORMER, role: "owner", acceptedAt: new Date("2022-01-01"), deletedAt: new Date("2023-01-01") },
    ]);
    await tx.insert(unitOccupancies).values({
      tenantId: TENANT.id, unitId: unit!.id, userId: FORMER, relation: "owner",
      startDate: new Date("2020-01-01"), endDate: new Date("2023-01-01"),
    });
    // 31 gün önce gelmiş, hâlâ açık başvuru.
    const [request] = await tx.insert(kvkkRequests).values({
      tenantId: TENANT.id, userId: FORMER, type: "access", detail: "Bilgi talebi",
      dueAt: new Date(Date.now() - 28 * 86_400_000), createdAt: new Date(Date.now() - 31 * 86_400_000),
    }).returning({ id: kvkkRequests.id });
    requestId = request!.id;
  });
});

afterAll(async () => {
  if (RUN) {
    await withBypassRls("test:jobs-cleanup", async (tx) => {
      await tx.delete(notifications).where(eq(notifications.tenantId, TENANT.id));
      await tx.delete(kvkkRequests).where(eq(kvkkRequests.tenantId, TENANT.id));
      await tx.delete(unitOccupancies).where(eq(unitOccupancies.tenantId, TENANT.id));
      await tx.delete(units).where(eq(units.tenantId, TENANT.id));
      await tx.delete(blocks).where(eq(blocks.tenantId, TENANT.id));
      await tx.delete(subscriptions).where(eq(subscriptions.tenantId, TENANT.id));
      await tx.delete(memberships).where(eq(memberships.tenantId, TENANT.id));
      await tx.delete(users).where(inArray(users.id, [MANAGER, FORMER]));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

describe.skipIf(!RUN)("uyum işleri", () => {
  it("KVKK süresi geçen başvuru için yöneticiye tek bir uyarı yazılıyor", async () => {
    const first = await kvkkRequestSla({ tenantId: TENANT.id });
    expect(first).toMatchObject({ overdue: 1, notified: 1 });
    const second = await kvkkRequestSla({ tenantId: TENANT.id });
    expect(second.notified).toBe(0);
    const rows = await withBypassRls("test:jobs-read", (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.userId, MANAGER), eq(notifications.resourceId, requestId))),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.template).toBe("kvkk_overdue");
  });

  it("saklama süresi dolan eski sakin aday olarak bulunuyor, silinmiyor", async () => {
    const result = await kvkkRetentionScan({ tenantId: TENANT.id });
    expect(result.candidates).toBe(1);
    const [former] = await withBypassRls("test:jobs-read", (tx) =>
      tx.select({ anonymizedAt: users.anonymizedAt, firstName: users.firstName }).from(users).where(eq(users.id, FORMER)),
    );
    expect(former).toMatchObject({ anonymizedAt: null, firstName: "Eski" });
  });

  it("deneme süresi biten site askıya alınıyor; ikinci koşu bir şey yapmıyor", async () => {
    expect(await expireTrial({ tenantId: TENANT.id })).toMatchObject({ suspended: true });
    const [state] = await withBypassRls("test:jobs-read", (tx) =>
      tx.select({ status: tenants.status, reason: tenants.suspensionReason }).from(tenants).where(eq(tenants.id, TENANT.id)),
    );
    expect(state).toMatchObject({ status: "suspended", reason: "trial_expired" });
    expect(await expireTrial({ tenantId: TENANT.id })).toMatchObject({ suspended: false });
  });
});
