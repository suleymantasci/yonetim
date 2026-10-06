import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  closeDb,
  plans,
  subscriptions,
  tenantAddons,
  tenants,
  withBypassRls,
} from "@yonetim/db";

import { consumeMessageCredit, isSmsQuotaExhausted } from "../../apps/api/src/communication/message-credit";

/** SMS/WhatsApp kredi düşümü: plan kotası → ek paket → aşım. */
const RUN = process.env.INTEGRATION === "1";
const TENANT = randomUUID();
let quota = 0;

beforeAll(async () => {
  if (!RUN) return;
  await withBypassRls("test:credit-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT, slug: `kredi-${Date.now()}`, name: "Kredi Testi", type: "apartment",
      unitCount: 5, status: "active", settings: {},
    });
    const [plan] = await tx.select({ id: plans.id, q: plans.smsQuotaYearly }).from(plans).where(eq(plans.code, "standart-1"));
    quota = plan!.q;
    await tx.insert(subscriptions).values({
      tenantId: TENANT, planId: plan!.id, status: "active", priceKurus: 0, listPriceKurus: 0,
      smsUsedThisPeriod: quota - 1, // yalnız 1 plan kredisi kaldı
    });
    await tx.insert(tenantAddons).values({
      tenantId: TENANT, kind: "sms", name: "Test paketi", purchasedQuantity: 1, remainingQuantity: 1,
    });
  });
});

afterAll(async () => {
  if (RUN) {
    await withBypassRls("test:credit-cleanup", async (tx) => {
      await tx.delete(tenantAddons).where(eq(tenantAddons.tenantId, TENANT));
      await tx.delete(subscriptions).where(eq(subscriptions.tenantId, TENANT));
      await tx.delete(tenants).where(eq(tenants.id, TENANT));
    });
  }
  await closeDb();
});

describe.skipIf(!RUN)("mesaj kredisi", () => {
  it("SMS: önce plan kotası, sonra ek paket, sonra aşım", async () => {
    const take = () => withBypassRls("test:credit", (tx) => consumeMessageCredit(tx, TENANT, "sms"));
    expect(await withBypassRls("t", (tx) => isSmsQuotaExhausted(tx, TENANT))).toBe(false);
    expect(await take()).toBe("plan");
    expect(await take()).toBe("addon");
    expect(await withBypassRls("t", (tx) => isSmsQuotaExhausted(tx, TENANT))).toBe(true);
    expect(await take()).toBe("overage");
    expect(await take()).toBe("overage");

    const [sub] = await withBypassRls("t", (tx) =>
      tx.select({ used: subscriptions.smsUsedThisPeriod }).from(subscriptions).where(eq(subscriptions.tenantId, TENANT)),
    );
    // plan 1 + aşım 2 sayaca girer; ek paketten düşen girmez.
    expect(sub!.used).toBe(quota - 1 + 1 + 2);

    const [addon] = await withBypassRls("t", (tx) =>
      tx.select({ left: tenantAddons.remainingQuantity, status: tenantAddons.status }).from(tenantAddons).where(eq(tenantAddons.tenantId, TENANT)),
    );
    expect(addon).toEqual({ left: 0, status: "depleted" });
  });

  it("WhatsApp: paketi yoksa serbest, varsa paketten düşer", async () => {
    const take = () => withBypassRls("test:credit", (tx) => consumeMessageCredit(tx, TENANT, "whatsapp"));
    expect(await take()).toBe("free");
    await withBypassRls("t", (tx) =>
      tx.insert(tenantAddons).values({ tenantId: TENANT, kind: "whatsapp", name: "WA", purchasedQuantity: 1, remainingQuantity: 1 }),
    );
    expect(await take()).toBe("addon");
    expect(await take()).toBe("free");
  });

  it("süresi dolmuş ek paketten düşmez", async () => {
    await withBypassRls("t", (tx) =>
      tx.insert(tenantAddons).values({
        tenantId: TENANT, kind: "sms", name: "Eski", purchasedQuantity: 5, remainingQuantity: 5,
        validUntil: new Date(Date.now() - 86_400_000),
      }),
    );
    expect(await withBypassRls("t", (tx) => consumeMessageCredit(tx, TENANT, "sms"))).toBe("overage");
  });
});
