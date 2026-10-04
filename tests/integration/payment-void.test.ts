import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  auditLogs,
  blocks,
  closeDb,
  debts,
  memberships,
  paymentAllocations,
  payments,
  sessions,
  tenants,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Tahsilat iptali — elle girilmiş tahsilatın ters kaydı.
 *
 * Sınanan sözleşme: kayıt silinmez (durum `cancelled`), mahsuplar geri alınır,
 * kapanan borç yeniden açılır, iz denetim kütüğünde ve ödeme metadata'sında
 * kalır; ikinci iptal, gerekçesiz iptal, kart ödemesi ve yetkisiz rol reddedilir.
 */

const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

const TENANT = { id: randomUUID(), slug: `void-${Date.now()}` };
const MANAGER = randomUUID();
const ACCOUNTANT = randomUUID();
let unitId = "";
let debtId = "";
let cardPaymentId = "";
let managerCookie = "";
let accountantCookie = "";

const apiReachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;

  await withBypassRls("test:void-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id,
      slug: TENANT.slug,
      name: "Tahsilat İptali Testi",
      type: "apartment",
      unitCount: 1,
      status: "active",
      settings: {},
    });
    const [block] = await tx
      .insert(blocks)
      .values({ tenantId: TENANT.id, name: "A", floorCount: 1, unitCount: 1 })
      .returning({ id: blocks.id });
    const [unit] = await tx
      .insert(units)
      .values({
        tenantId: TENANT.id,
        blockId: block!.id,
        number: "7",
        floor: 1,
        type: "flat",
        areaM2: "90",
        landShare: "1",
      })
      .returning({ id: units.id });
    unitId = unit!.id;

    const stamp = String(Date.now()).slice(-5);
    await tx.insert(users).values([
      { id: MANAGER, firstName: "Yönetici", lastName: "İptal", phone: `+9055503${stamp}`, locale: "tr" },
      { id: ACCOUNTANT, firstName: "Muhasebe", lastName: "İptal", phone: `+9055504${stamp}`, locale: "tr" },
    ]);
    await tx.insert(memberships).values([
      { tenantId: TENANT.id, userId: MANAGER, role: "manager", acceptedAt: new Date() },
      { tenantId: TENANT.id, userId: ACCOUNTANT, role: "accountant", acceptedAt: new Date() },
    ]);

    const [debt] = await tx
      .insert(debts)
      .values({
        tenantId: TENANT.id,
        unitId,
        kind: "dues",
        description: "Ekim aidatı",
        amountKurus: 150_000,
        dueDate: new Date("2026-10-10"),
      })
      .returning({ id: debts.id });
    debtId = debt!.id;

    // Kartla alınmış tamamlanmış ödeme — panelden iptal edilmemeli.
    const [card] = await tx
      .insert(payments)
      .values({
        tenantId: TENANT.id,
        unitId,
        amountKurus: 10_000,
        method: "card",
        processor: "iyzico",
        processorRef: `test-${randomUUID()}`,
        status: "completed",
        paidAt: new Date(),
      })
      .returning({ id: payments.id });
    cardPaymentId = card!.id;
  });

  managerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: MANAGER, tenantId: TENANT.id })).token}`;
  accountantCookie = `${SESSION_COOKIE}=${(await createSession({ userId: ACCOUNTANT, tenantId: TENANT.id })).token}`;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:void-cleanup", async (tx) => {
      await tx.delete(sessions).where(inArray(sessions.userId, [MANAGER, ACCOUNTANT]));
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.tenantId, TENANT.id));
      await tx.delete(payments).where(eq(payments.tenantId, TENANT.id));
      await tx.delete(debts).where(eq(debts.tenantId, TENANT.id));
      await tx.delete(units).where(eq(units.tenantId, TENANT.id));
      await tx.delete(blocks).where(eq(blocks.tenantId, TENANT.id));
      await tx.delete(memberships).where(eq(memberships.tenantId, TENANT.id));
      await tx.delete(users).where(inArray(users.id, [MANAGER, ACCOUNTANT]));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

async function post(path: string, body: unknown, cookie = managerCookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin: PANEL_ORIGIN,
      "x-tenant-slug": TENANT.slug,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function debtRow() {
  return withBypassRls("test:void-read", async (tx) => {
    const [row] = await tx
      .select({ paidKurus: debts.paidKurus, status: debts.status })
      .from(debts)
      .where(eq(debts.id, debtId));
    return row!;
  });
}

describe.skipIf(!apiReachable)("tahsilat iptali", () => {
  let paymentId = "";

  it("tahsilat borcu kapatıyor", async () => {
    const res = await post("/v1/panel/debts/collect", {
      unitId,
      amountMinor: 150_000,
      method: "bank_transfer",
      paidAt: new Date().toISOString(),
      receiptNo: "MKB-1",
    });
    expect(res.status).toBe(201);
    paymentId = String(res.body.paymentId);
    expect(await debtRow()).toMatchObject({ paidKurus: 150_000, status: "paid" });
  });

  it("gerekçesiz iptal reddediliyor", async () => {
    const res = await post(`/v1/panel/debts/payments/${paymentId}/void`, { reason: "kısa" });
    expect(res.status).toBe(422);
  });

  it("muhasebeci iptal edemiyor (dört göz)", async () => {
    const res = await post(
      `/v1/panel/debts/payments/${paymentId}/void`,
      { reason: "Yanlış daireye girilmiş tahsilat" },
      accountantCookie,
    );
    expect(res.status).toBe(403);
  });

  it("iptal borcu yeniden açıyor, kaydı silmiyor, iz bırakıyor", async () => {
    const res = await post(`/v1/panel/debts/payments/${paymentId}/void`, {
      reason: "Yanlış daireye girilmiş tahsilat",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reopenedDebtCount: 1, reversedMinor: 150_000 });

    expect(await debtRow()).toMatchObject({ paidKurus: 0 });
    expect((await debtRow()).status).not.toBe("paid");

    const state = await withBypassRls("test:void-check", async (tx) => {
      const [payment] = await tx
        .select({ status: payments.status, metadata: payments.metadata })
        .from(payments)
        .where(eq(payments.id, paymentId));
      const allocations = await tx
        .select({ id: paymentAllocations.id })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, paymentId));
      const audit = await tx
        .select({ action: auditLogs.action, reason: auditLogs.reason })
        .from(auditLogs)
        .where(eq(auditLogs.resourceId, paymentId));
      return { payment, allocations, audit };
    });
    expect(state.payment?.status).toBe("cancelled");
    expect(state.allocations).toHaveLength(0);
    expect((state.payment?.metadata as { voided?: { allocations?: unknown[] } }).voided?.allocations).toHaveLength(1);
    expect(state.audit.map((a) => a.action)).toContain("payment_voided");
  });

  it("ikinci iptal reddediliyor", async () => {
    const res = await post(`/v1/panel/debts/payments/${paymentId}/void`, {
      reason: "Yanlış daireye girilmiş tahsilat",
    });
    expect(res.status).toBe(409);
  });

  it("kart ödemesi panelden iptal edilemiyor", async () => {
    const res = await post(`/v1/panel/debts/payments/${cardPaymentId}/void`, {
      reason: "Kart ödemesini iptal etme denemesi",
    });
    expect(res.status).toBe(400);
  });
});
