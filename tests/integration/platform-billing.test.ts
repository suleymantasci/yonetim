import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  closeDb,
  invoices,
  plans,
  promoCodeRedemptions,
  promoCodes,
  sessions,
  subscriptions,
  tenants,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Platform faturalandırma — manuel paket atama, promosyon kodu, özel indirim.
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

const TENANT = { id: randomUUID(), slug: `fatura-${Date.now()}` };
const SUPER = randomUUID();
const SUPPORT = randomUUID();
const CODE = `TEST${String(Date.now()).slice(-6)}`;
let planId = "";
let planYearly = 0;
let superCookie = "";
let supportCookie = "";

const apiReachable = await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;
  await withBypassRls("test:billing-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id, slug: TENANT.slug, name: "Faturalandırma Testi", type: "apartment",
      unitCount: 24, status: "suspended", suspensionReason: "trial_expired", settings: {},
    });
    const [plan] = await tx.select().from(plans).where(eq(plans.code, "standart-2")).limit(1);
    const [any] = plan ? [plan] : await tx.select().from(plans).limit(1);
    planId = any!.id;
    planYearly = Number(any!.yearlyPriceKurus);
    await tx.insert(users).values([
      { id: SUPER, firstName: "Süper", lastName: "Fatura", email: `super-b-${Date.now()}@ornek.test`, locale: "tr", platformRole: "super_admin" },
      { id: SUPPORT, firstName: "Destek", lastName: "Fatura", email: `support-b-${Date.now()}@ornek.test`, locale: "tr", platformRole: "support_agent" },
    ]);
  });
  superCookie = `${SESSION_COOKIE}=${(await createSession({ userId: SUPER })).token}`;
  supportCookie = `${SESSION_COOKIE}=${(await createSession({ userId: SUPPORT })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:billing-cleanup", async (tx) => {
      await tx.delete(sessions).where(inArray(sessions.userId, [SUPER, SUPPORT]));
      await tx.delete(invoices).where(eq(invoices.tenantId, TENANT.id));
      await tx.delete(promoCodeRedemptions).where(eq(promoCodeRedemptions.tenantId, TENANT.id));
      await tx.delete(subscriptions).where(eq(subscriptions.tenantId, TENANT.id));
      await tx.delete(promoCodes).where(eq(promoCodes.code, CODE));
      await tx.delete(users).where(inArray(users.id, [SUPER, SUPPORT]));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function call(method: string, path: string, body?: unknown, cookie = superCookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: PANEL_ORIGIN, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const base = () => ({ tenantId: TENANT.id, planId, period: "yearly", periodCount: 1 });

describe.skipIf(!apiReachable)("platform faturalandırma", () => {
  it("promosyon kodu oluşturuluyor; aynı kod ikinci kez açılamıyor", async () => {
    const payload = {
      code: CODE.toLowerCase(),
      discountType: "percent",
      discountValue: 25,
      validFrom: new Date(Date.now() - 86_400_000).toISOString(),
      validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      usageLimit: 10,
    };
    expect((await call("POST", "/v1/panel/platform/promo-codes", payload)).status).toBe(201);
    expect((await call("POST", "/v1/panel/platform/promo-codes", payload)).status).toBe(409);
    const list = await call("GET", "/v1/panel/platform/promo-codes");
    const row = (list.body.rows as Array<Record<string, unknown>>).find((r) => r.code === CODE)!;
    expect(row).toMatchObject({ usable: true, usedCount: 0 });
  });

  it("önizleme: yıllık liste fiyatı %25 indirimle", async () => {
    const res = await call("POST", "/v1/panel/platform/subscriptions/quote", {
      ...base(),
      discount: { kind: "promo", code: CODE },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      listPriceMinor: planYearly,
      discountMinor: Math.round(planYearly * 0.25),
      finalPriceMinor: planYearly - Math.round(planYearly * 0.25),
      promoError: null,
      months: 12,
    });
  });

  it("geçersiz kod önizlemede sebebiyle dönüyor", async () => {
    const res = await call("POST", "/v1/panel/platform/subscriptions/quote", {
      ...base(),
      discount: { kind: "promo", code: "YOKBOYLEKOD" },
    });
    expect(res.body).toMatchObject({ promoError: "not_found", discountMinor: 0 });
  });

  it("destek personeli paket atayamıyor", async () => {
    const res = await call(
      "POST",
      "/v1/panel/platform/subscriptions/assign",
      { ...base(), discount: { kind: "none" }, startsAt: new Date().toISOString(), markPaid: true },
      supportCookie,
    );
    expect(res.status).toBe(403);
  });

  it("atama: askıdaki site açılıyor, abonelik ve ödenmiş fatura yazılıyor, kod kullanılıyor", async () => {
    const res = await call("POST", "/v1/panel/platform/subscriptions/assign", {
      ...base(),
      discount: { kind: "promo", code: CODE },
      startsAt: new Date().toISOString(),
      markPaid: true,
      note: "Havale ile tahsil edildi",
    });
    expect(res.status).toBe(201);
    const state = await withBypassRls("test:billing-check", async (tx) => {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, TENANT.id));
      const subs = await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, TENANT.id));
      const [invoice] = await tx.select().from(invoices).where(eq(invoices.tenantId, TENANT.id));
      const [code] = await tx.select().from(promoCodes).where(eq(promoCodes.code, CODE));
      return { tenant, subs, invoice, code };
    });
    expect(state.tenant).toMatchObject({ status: "active", planId, suspensionReason: null });
    expect(state.subs.filter((s) => s.status === "active")).toHaveLength(1);
    expect(state.invoice).toMatchObject({ status: "paid", totalKurus: planYearly - Math.round(planYearly * 0.25) });
    expect(Number(state.invoice!.vatKurus)).toBeGreaterThan(0);
    expect(state.code?.usedCount).toBe(1);
  });

  it("aynı kod aynı siteye ikinci kez kullanılamıyor", async () => {
    const res = await call("POST", "/v1/panel/platform/subscriptions/assign", {
      ...base(),
      discount: { kind: "promo", code: CODE },
      startsAt: new Date().toISOString(),
      markPaid: false,
    });
    expect(res.status).toBe(409);
  });

  it("özel indirim gerekçesiz reddediliyor; gerekçeyle önceki aboneliği kapatıyor", async () => {
    const bad = await call("POST", "/v1/panel/platform/subscriptions/assign", {
      ...base(),
      discount: { kind: "special", type: "amount", value: 500, note: "kısa" },
      startsAt: new Date().toISOString(),
      markPaid: false,
    });
    expect(bad.status).toBe(422);

    const ok = await call("POST", "/v1/panel/platform/subscriptions/assign", {
      ...base(),
      period: "monthly",
      periodCount: 3,
      discount: { kind: "special", type: "amount", value: 500, note: "Göç kampanyası kapsamında özel fiyat" },
      startsAt: new Date().toISOString(),
      markPaid: false,
    });
    expect(ok.status).toBe(201);
    const subs = await withBypassRls("test:billing-check2", (tx) =>
      tx.select().from(subscriptions).where(eq(subscriptions.tenantId, TENANT.id)),
    );
    expect(subs.filter((s) => s.status === "active")).toHaveLength(1);
    const active = subs.find((s) => s.status === "active")!;
    expect(active.billingPeriod).toBe("monthly");
    expect(Number(active.discountKurus)).toBe(50_000);
  });
});
