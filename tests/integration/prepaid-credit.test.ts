import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  bankAccounts,
  bankTransactions,
  closeDb,
  debts,
  paymentAllocations,
  payments,
  withBypassRls,
} from "@yonetim/db";
import { apiReachable, createSite, type TestSite } from "./_site";

let site: TestSite;
beforeEach(async () => {
  if (apiReachable) site = await createSite("avans", 2);
});
afterEach(async () => {
  if (apiReachable) await site.cleanup();
});
afterAll(closeDb);

async function collect(amountMinor: number, unitIndex = 0) {
  const response = await site.call("POST", "/v1/panel/debts/collect", {
    unitId: site.unitIds[unitIndex],
    amountMinor,
    method: "cash",
    paidAt: new Date().toISOString(),
    receiptNo: randomUUID().slice(0, 20),
  });
  expect(response.status).toBe(201);
  return response.body;
}
async function insertDebt(
  amountKurus: number,
  overrides: Partial<typeof debts.$inferInsert> = {},
) {
  return withBypassRls("test:prepaid-debt", async (tx) => {
    const [row] = await tx
      .insert(debts)
      .values({
        tenantId: site.tenantId,
        unitId: site.unitIds[0]!,
        debtorUserId: site.tenantResidentId,
        description: "Aidat",
        amountKurus,
        dueDate: new Date("2030-01-01"),
        ...overrides,
      })
      .returning({ id: debts.id });
    // AFTER INSERT triggers update the stored row; RETURNING can reflect the pre-trigger row.
    return (await tx.select().from(debts).where(eq(debts.id, row!.id)))[0]!;
  });
}
async function residentBalance() {
  const response = await site.call(
    "GET",
    `/v1/panel/residents/${site.tenantResidentId}`,
  );
  expect(response.status).toBe(200);
  return response.body.balance as {
    creditBalanceMinor: number;
    paidTotalMinor: number;
    outstandingMinor: number;
  };
}

describe.skipIf(!apiReachable)(
  "real database prepaid credit and cancelled debt accounting",
  () => {
    it("saves an annual advance without debt and consumes it as twelve months are created", async () => {
      expect(await collect(12_000)).toMatchObject({
        allocatedMinor: 0,
        creditBalanceMinor: 12_000,
      });
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 12_000,
        paidTotalMinor: 12_000,
      });
      for (let month = 1; month <= 12; month++) {
        const row = await insertDebt(1_000, {
          period: `2030-${String(month).padStart(2, "0")}`,
        });
        expect(row).toMatchObject({ paidKurus: 1_000, status: "paid" });
      }
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 0,
        paidTotalMinor: 12_000,
        outstandingMinor: 0,
      });
      await withBypassRls("test:prepaid-single-receipt", async (tx) => {
        expect(
          await tx
            .select()
            .from(payments)
            .where(eq(payments.tenantId, site.tenantId)),
        ).toHaveLength(1);
        expect(
          await tx
            .select()
            .from(paymentAllocations)
            .where(eq(paymentAllocations.tenantId, site.tenantId)),
        ).toHaveLength(12);
      });
    });

    it("excludes cancelled debts even when deleted_at is null and never pays them", async () => {
      const cancelled = await insertDebt(9_000, {
        status: "cancelled",
        lateFeeKurus: 500,
      });
      await insertDebt(1_000);
      const list = await site.call("GET", "/v1/panel/debts?status=acik");
      expect(
        (list.body.rows as { id: string }[]).map((row) => row.id),
      ).not.toContain(cancelled.id);
      expect(list.body.totals).toMatchObject({
        outstandingMinor: 1_000,
        lateFeeMinor: 0,
      });
      expect(await collect(1_500)).toMatchObject({
        allocatedMinor: 1_000,
        creditBalanceMinor: 500,
      });
      await withBypassRls("test:cancelled-intact", async (tx) => {
        expect(
          (await tx.select().from(debts).where(eq(debts.id, cancelled.id)))[0],
        ).toMatchObject({ status: "cancelled", paidKurus: 0 });
      });
      const report = await site.call(
        "GET",
        "/v1/panel/reports/debts/matrix?year=2030&value=charged&basis=due",
      );
      expect(report.body.totals).toMatchObject({ totalMinor: 1_000 });
      expect(await residentBalance()).toMatchObject({
        outstandingMinor: 0,
        creditBalanceMinor: 500,
        paidTotalMinor: 1_500,
      });
    });

    it("does not use a tenant's advance for an owner's or another unit's debts", async () => {
      await collect(2_000);
      expect(
        await insertDebt(1_000, { debtorUserId: site.ownerIds[0] }),
      ).toMatchObject({ paidKurus: 0 });
      expect(
        await insertDebt(1_000, { unitId: site.unitIds[1] }),
      ).toMatchObject({ paidKurus: 0 });
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 2_000,
      });
      expect(await insertDebt(500)).toMatchObject({
        paidKurus: 500,
        status: "paid",
      });
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 1_500,
      });
    });

    it("accepts a bank transfer with no debt and exposes the advance in the resident and unit", async () => {
      const movementId = randomUUID();
      await withBypassRls("test:advance-bank", async (tx) => {
        const [account] = await tx
          .insert(bankAccounts)
          .values({
            tenantId: site.tenantId,
            bankName: "Test",
            ibanEncrypted: "test",
            ibanMasked: "TR test",
          })
          .returning({ id: bankAccounts.id });
        await tx
          .insert(bankTransactions)
          .values({
            id: movementId,
            tenantId: site.tenantId,
            accountId: account!.id,
            externalId: movementId,
            direction: "in",
            amountKurus: 12_000,
            provider: "csv",
            transactionAt: new Date(),
            matchedUnitId: site.unitIds[0],
            matchStatus: "suggested",
          });
      });
      const response = await site.call(
        "POST",
        `/v1/panel/bank/transactions/${movementId}/confirm`,
        {},
      );
      expect(response.status).toBe(201);
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 12_000,
        paidTotalMinor: 12_000,
      });
      const unit = await site.call("GET", `/v1/panel/units/${site.unitIds[0]}`);
      expect(unit.body.debtSummary).toMatchObject({
        creditBalanceMinor: 12_000,
      });
    });

    it("voids both the allocated payment and its advance without counting cancelled money", async () => {
      const first = await insertDebt(1_000);
      const receipt = await collect(12_000);
      const second = await insertDebt(1_000);
      const response = await site.call(
        "POST",
        `/v1/panel/debts/payments/${receipt.paymentId}/void`,
        { reason: "Yanlış tahsilat kaydı düzeltildi" },
      );
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        reversedMinor: 12_000,
        reopenedDebtCount: 2,
      });
      expect(await residentBalance()).toMatchObject({
        creditBalanceMinor: 0,
        paidTotalMinor: 0,
        outstandingMinor: 2_000,
      });
      await withBypassRls("test:advance-void-debts", async (tx) => {
        for (const row of [first, second])
          expect(
            (await tx.select().from(debts).where(eq(debts.id, row.id)))[0]!
              .paidKurus,
          ).toBe(0);
      });
    });
  },
);
