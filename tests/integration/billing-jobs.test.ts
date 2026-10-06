import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import {
  closeDb,
  invoices,
  memberships,
  notifications,
  plans,
  subscriptions,
  tenants,
  users,
  withBypassRls,
} from "@yonetim/db";
import { purgeExpiredArchive, renewSubscription, runDunning } from "@yonetim/jobs";

/**
 * Faturalama işleri: yenileme, dunning, arşiv tasfiyesi — doğrudan iş
 * fonksiyonları, gerçek Postgres (worker kuyruğu olmadan).
 */
const RUN = process.env.INTEGRATION === "1";
const DAY = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00Z");
const MANAGER = randomUUID();
const ids: string[] = [];
let planId = "";
let quota = 0;

async function site(opts: {
  status?: "active" | "past_due" | "suspended" | "archived";
  reason?: string;
  purgeAfterAt?: Date;
  sub?: Partial<typeof subscriptions.$inferInsert> | null;
}) {
  const id = randomUUID();
  ids.push(id);
  await withBypassRls("test:billing-site", async (tx) => {
    await tx.insert(tenants).values({
      id, slug: `fatura-${id.slice(0, 8)}`, name: "Fatura Testi", type: "apartment", unitCount: 5,
      status: opts.status ?? "active", suspensionReason: opts.reason ?? null,
      purgeAfterAt: opts.purgeAfterAt ?? null, archivedAt: opts.purgeAfterAt ? NOW : null, settings: {},
    });
    await tx.insert(memberships).values({ tenantId: id, userId: MANAGER, role: "manager", acceptedAt: NOW });
    if (opts.sub !== null) {
      await tx.insert(subscriptions).values({
        tenantId: id, planId, status: "active", priceKurus: 100_000, listPriceKurus: 120_000,
        billingPeriod: "yearly", currentPeriodStart: new Date(NOW.getTime() - 365 * DAY),
        currentPeriodEnd: new Date(NOW.getTime() - DAY), ...opts.sub,
      });
    }
  });
  return id;
}

async function invoice(tenantId: string, dueDaysAgo: number, status: "issued" | "paid" = "issued") {
  await withBypassRls("test:billing-invoice", (tx) =>
    tx.insert(invoices).values({
      tenantId, invoiceNo: `T-${randomUUID().slice(0, 12)}`, status, subtotalKurus: 100, vatKurus: 20,
      totalKurus: 120, issuedAt: new Date(NOW.getTime() - (dueDaysAgo + 7) * DAY),
      dueAt: new Date(NOW.getTime() - dueDaysAgo * DAY), paidAt: status === "paid" ? NOW : null,
    }),
  );
}

const tenantOf = (id: string) =>
  withBypassRls("t", async (tx) => (await tx.select().from(tenants).where(eq(tenants.id, id)))[0]!);
const subOf = (id: string) =>
  withBypassRls("t", async (tx) => (await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, id)))[0]!);

beforeAll(async () => {
  if (!RUN) return;
  await withBypassRls("test:billing-setup", async (tx) => {
    const [plan] = await tx.select({ id: plans.id, q: plans.smsQuotaYearly }).from(plans).where(eq(plans.code, "standart-1"));
    planId = plan!.id;
    quota = plan!.q;
    await tx.insert(users).values({ id: MANAGER, firstName: "Fatura", lastName: "Yönetici", phone: `+9055515${String(Date.now()).slice(-5)}`, locale: "tr" });
  });
});

afterAll(async () => {
  if (RUN) {
    await withBypassRls("test:billing-cleanup", async (tx) => {
      await tx.delete(notifications).where(inArray(notifications.tenantId, ids));
      await tx.delete(invoices).where(inArray(invoices.tenantId, ids));
      await tx.delete(subscriptions).where(inArray(subscriptions.tenantId, ids));
      await tx.delete(memberships).where(eq(memberships.userId, MANAGER));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(tenants).where(inArray(tenants.id, ids));
    });
  }
  await closeDb();
});

describe.skipIf(!RUN)("billing.renewal", () => {
  it("dönemi biten abonelik yenilenir: fatura, ileri dönem, aşım, sıfırlanan sayaç", async () => {
    const id = await site({ sub: { smsUsedThisPeriod: quota + 10 } });
    const res = await renewSubscription({ tenantId: id, now: NOW });
    expect(res).toMatchObject({ action: "renewed", overageCount: 10 });
    // liste 1200 ₺, önceki 1000 ₺ → %30 sınırı 1300 ₺: liste uygulanır. + 10 × 0,30 ₺ = 3 ₺
    expect(res.totalKurus).toBe(120_000 + 300);

    const sub = await subOf(id);
    expect(sub.smsUsedThisPeriod).toBe(0);
    expect(sub.currentPeriodEnd!.getFullYear()).toBe(NOW.getFullYear() + 1);
    expect(sub.priceKurus).toBe(120_000);

    const [inv] = await withBypassRls("t", (tx) => tx.select().from(invoices).where(eq(invoices.tenantId, id)));
    expect(inv).toMatchObject({ status: "issued", smsOverageCount: 10, smsOverageKurus: 300, totalKurus: 120_300 });

    // İdempotent: dönem ilerledi, ikinci koşu bir şey yapmaz.
    expect((await renewSubscription({ tenantId: id, now: NOW })).action).toBe("none");
    expect(await withBypassRls("t", (tx) => tx.select().from(invoices).where(eq(invoices.tenantId, id)))).toHaveLength(1);
  });

  it("fiyat artışı yıllık %30 ile sınırlı", async () => {
    const id = await site({ sub: { priceKurus: 50_000, listPriceKurus: 120_000 } });
    const res = await renewSubscription({ tenantId: id, now: NOW });
    expect(res.totalKurus).toBe(65_000); // 500 ₺ × 1,3
  });

  it("dönemi bitmemiş abonelik yenilenmez", async () => {
    const id = await site({ sub: { currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY) } });
    expect((await renewSubscription({ tenantId: id, now: NOW })).action).toBe("none");
  });

  it("dönem sonunda iptal istenmişse abonelik kapanır, site salt-okunur olur", async () => {
    const id = await site({ sub: { cancelAtPeriodEnd: true } });
    expect((await renewSubscription({ tenantId: id, now: NOW })).action).toBe("cancelled");
    expect((await subOf(id)).status).toBe("cancelled");
    expect(await tenantOf(id)).toMatchObject({ status: "suspended", suspensionReason: "subscription_cancelled" });
  });
});

describe.skipIf(!RUN)("billing.dunning", () => {
  it("gecikme gününe göre adım adım ilerler ve aynı adımı tekrarlamaz", async () => {
    const id = await site({ sub: { currentPeriodEnd: new Date(NOW.getTime() + 300 * DAY) } });
    await invoice(id, 0); // vadesi bugün: henüz gecikmiş sayılmaz
    expect((await runDunning({ tenantId: id, now: NOW })).action).toBe("none");

    await withBypassRls("t", (tx) => tx.update(invoices).set({ dueAt: new Date(NOW.getTime() - 2 * DAY) }).where(eq(invoices.tenantId, id)));
    expect(await runDunning({ tenantId: id, now: NOW })).toMatchObject({ action: "step", step: 1 });
    expect(await tenantOf(id)).toMatchObject({ status: "past_due" });
    expect((await subOf(id)).status).toBe("past_due");
    expect((await withBypassRls("t", (tx) => tx.select().from(invoices).where(eq(invoices.tenantId, id))))[0]!.status).toBe("overdue");
    expect((await runDunning({ tenantId: id, now: NOW })).action).toBe("none");

    // 15. gün → salt-okunur askı (ara adımlar atlansa da en son adım uygulanır)
    const later = new Date(NOW.getTime() + 13 * DAY);
    expect(await runDunning({ tenantId: id, now: later })).toMatchObject({ step: 4, stepAction: "suspend_read_only" });
    expect(await tenantOf(id)).toMatchObject({ status: "suspended", suspensionReason: "payment_overdue" });

    // 31. gün → arşiv, 90 gün kurtarma penceresi
    const archive = new Date(NOW.getTime() + 29 * DAY);
    expect(await runDunning({ tenantId: id, now: archive })).toMatchObject({ step: 5, stepAction: "archive" });
    const t = await tenantOf(id);
    expect(t.status).toBe("archived");
    expect(t.purgeAfterAt!.getTime()).toBe(archive.getTime() + 90 * DAY);

    const notes = await withBypassRls("t", (tx) => tx.select({ template: notifications.template }).from(notifications).where(eq(notifications.tenantId, id)));
    expect(notes.map((n) => n.template).sort()).toEqual(["dunning_1", "dunning_4", "dunning_5"]);
  });

  it("ödeme gelince gecikme nedeniyle askıdaki site yeniden açılır", async () => {
    const id = await site({ status: "suspended", reason: "payment_overdue", sub: { status: "suspended", dunningStep: 4, currentPeriodEnd: new Date(NOW.getTime() + 300 * DAY) } });
    await invoice(id, 20, "paid");
    expect((await runDunning({ tenantId: id, now: NOW })).action).toBe("recovered");
    expect(await tenantOf(id)).toMatchObject({ status: "active", suspensionReason: null });
    expect(await subOf(id)).toMatchObject({ status: "active", dunningStep: 0 });
  });

  it("elle askıya alınmış site ödeme gelse de açılmaz", async () => {
    const id = await site({ status: "suspended", reason: "manual_review", sub: { status: "suspended", dunningStep: 4, currentPeriodEnd: new Date(NOW.getTime() + 300 * DAY) } });
    await runDunning({ tenantId: id, now: NOW });
    expect((await tenantOf(id)).status).toBe("suspended");
  });
});

describe.skipIf(!RUN)("billing.archive-purge", () => {
  it("kurtarma penceresi dolan arşivli site tasfiye edilir; dolmayan edilmez", async () => {
    const old = await site({ status: "archived", purgeAfterAt: new Date(NOW.getTime() - DAY), sub: { status: "archived" } });
    const fresh = await site({ status: "archived", purgeAfterAt: new Date(NOW.getTime() + 30 * DAY), sub: { status: "archived" } });
    const active = await site({});

    expect(await purgeExpiredArchive({ tenantId: old, now: NOW })).toMatchObject({ purged: true });
    expect(await purgeExpiredArchive({ tenantId: fresh, now: NOW })).toMatchObject({ purged: false });
    expect(await purgeExpiredArchive({ tenantId: active, now: NOW })).toMatchObject({ purged: false });

    expect(await tenantOf(old)).toMatchObject({ status: "cancelled" });
    expect((await tenantOf(old)).deletedAt).not.toBeNull();
    expect((await subOf(old)).status).toBe("cancelled");
    expect((await tenantOf(fresh)).status).toBe("archived");
  });
});
