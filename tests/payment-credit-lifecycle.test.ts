import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { Database } from "@yonetim/db";
import type { PaymentCollect } from "@yonetim/contracts";
import { DebtWriteRepository } from "../apps/api/src/finance/debt/debt-write.repository";
import type { DbService } from "../apps/api/src/infra/db/db.service";

function repository(results: unknown[][]) {
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  const conditions: string[] = [];
  const deleted: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => {
          conditions.push(new PgDialect().sqlToQuery(condition).sql);
          const rows = results.shift() ?? [];
          return {
            then: (resolve: (rows: unknown[]) => void) => resolve(rows),
            for: async () => rows,
            limit: async () => rows,
          };
        },
      }),
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (value: Record<string, unknown>) => {
        writes.push({ table: getTableName(table), value });
        return {
          then: (resolve: () => void) => resolve(),
          returning: async () => [{ id: "payment" }],
        };
      },
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (value: Record<string, unknown>) => {
        writes.push({ table: getTableName(table), value });
        return { where: async () => undefined };
      },
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async () => {
        deleted.push(getTableName(table));
      },
    }),
  };
  const transaction = async <T>(fn: (db: Database) => Promise<T>) =>
    fn(tx as unknown as Database);
  const db = {
    ctx: () => ({ tenantId: "site", userId: "manager" }),
    tx: transaction,
    txWithReason: (_reason: string, fn: (db: Database) => Promise<unknown>) =>
      transaction(fn),
  };
  return {
    repo: new DebtWriteRepository(db as unknown as DbService),
    writes,
    conditions,
    deleted,
  };
}
const occupancy = { userId: "resident", relation: "tenant", endDate: null };
const debt = {
  id: "debt",
  debtorUserId: "resident",
  amountKurus: 1_000,
  paidKurus: 0,
  lateFeeKurus: 0,
  dueDate: new Date("2030-01-01"),
  kind: "dues",
  status: "pending",
};
const payment: PaymentCollect = {
  unitId: "unit",
  amountMinor: 12_000,
  method: "cash",
  paidAt: new Date(),
  debtIds: [],
  receiptNo: "test",
};

describe("collection and advance lifecycle", () => {
  it("records the full annual payment with no open debt and assigns the resident's account", async () => {
    const { repo, writes, conditions } = repository([
      [{ id: "unit" }],
      [occupancy],
      [],
    ]);
    const result = await repo.collect(payment);
    expect(result).toMatchObject({
      allocatedMinor: 0,
      creditBalanceMinor: 12_000,
      closedDebtCount: 0,
    });
    expect(writes).toEqual([
      {
        table: "payments",
        value: expect.objectContaining({
          amountKurus: 12_000,
          debtorUserId: "resident",
          status: "completed",
          payerUserId: null,
        }),
      },
    ]);
    expect(
      conditions.some(
        (sql) => sql.includes("'cancelled'") && sql.includes("deleted_at"),
      ),
    ).toBe(true);
  });

  it("retains the overpayment while allocating only the actual remaining debt", async () => {
    const { repo, writes } = repository([
      [{ id: "unit" }],
      [occupancy],
      [debt],
    ]);
    expect(await repo.collect(payment)).toMatchObject({
      allocatedMinor: 1_000,
      creditBalanceMinor: 11_000,
      closedDebtCount: 1,
    });
    expect(writes).toContainEqual({
      table: "payment_allocations",
      value: {
        tenantId: "site",
        paymentId: "payment",
        debtId: "debt",
        amountKurus: 1_000,
      },
    });
    expect(writes).toContainEqual({
      table: "debts",
      value: { paidKurus: 1_000, status: "paid" },
    });
    expect(writes[0]!.value.amountKurus).toBe(12_000);
  });

  it("keeps a new tenant's advance away from the owner's and former tenant's debts", async () => {
    const { repo, writes } = repository([
      [{ id: "unit" }],
      [occupancy],
      [
        { ...debt, debtorUserId: "owner" },
        { ...debt, id: "old-debt", debtorUserId: "old-tenant" },
      ],
    ]);
    expect(await repo.collect(payment)).toMatchObject({
      allocatedMinor: 0,
      creditBalanceMinor: 12_000,
    });
    expect(writes.every((row) => row.table === "payments")).toBe(true);
  });

  it("supports an explicit owner account even while a tenant occupies the unit", async () => {
    const { repo, writes } = repository([
      [{ id: "unit" }],
      [occupancy, { ...occupancy, userId: "owner", relation: "owner" }],
      [{ ...debt, debtorUserId: "owner" }],
    ]);
    expect(
      await repo.collect({ ...payment, debtorUserId: "owner" }),
    ).toMatchObject({ allocatedMinor: 1_000 });
    expect(writes[0]!.value.debtorUserId).toBe("owner");
  });

  it("rejects an account from another unit", async () => {
    const { repo, writes } = repository([
      [{ id: "unit" }],
      [occupancy],
      [debt],
    ]);
    await expect(
      repo.collect({ ...payment, debtorUserId: "stranger" }),
    ).rejects.toThrow("debtor_not_in_unit");
    expect(writes).toEqual([]);
  });

  it("rejects a cancelled, deleted or foreign debt explicitly selected for allocation", async () => {
    const { repo, writes } = repository([[{ id: "unit" }], [occupancy], []]);
    await expect(
      repo.collect({ ...payment, debtIds: ["cancelled-debt"] }),
    ).rejects.toThrow("invalid_target_debts");
    expect(writes).toEqual([]);
  });

  it.each(["offset", "credit_balance"] as const)(
    "does not manufacture cash credit from %s",
    async (method) => {
      const { repo, writes } = repository([[{ id: "unit" }], [occupancy], []]);
      await expect(repo.collect({ ...payment, method })).rejects.toThrow(
        "validation_failed",
      );
      expect(writes).toEqual([]);
    },
  );

  it("reuses a bank transfer after a finalization failure without inserting more money", async () => {
    const { repo, writes } = repository([
      [{ id: "unit" }],
      [
        {
          id: "payment",
          status: "completed",
          unitId: "unit",
          amountKurus: 12_000,
          refundedKurus: 0,
        },
      ],
      [{ amount: 1_000 }],
    ]);
    expect(await repo.collect(payment, "bank:transfer")).toMatchObject({
      paymentId: "payment",
      reused: true,
      allocatedMinor: 1_000,
      creditBalanceMinor: 11_000,
    });
    expect(writes).toEqual([]);
  });

  it("voids the entire receipt, including its unallocated advance", async () => {
    const { repo, writes, deleted } = repository([
      [{ unitId: "unit" }],
      [{ id: "unit" }],
      [
        {
          id: "payment",
          status: "completed",
          processor: "manual",
          amountKurus: 12_000,
          refundedKurus: 0,
          metadata: {},
        },
      ],
      [],
    ]);
    expect(
      await repo.voidPayment("payment", "Yanlış tahsilat kaydı"),
    ).toMatchObject({ reversedMinor: 12_000, reopenedDebtCount: 0 });
    expect(deleted).toEqual(["payment_allocations"]);
    expect(writes).toContainEqual({
      table: "payments",
      value: expect.objectContaining({ status: "cancelled" }),
    });
  });

  it("does not reopen an already cancelled debt when its old payment is voided", async () => {
    const { repo, writes } = repository([
      [{ unitId: "unit" }],
      [{ id: "unit" }],
      [
        {
          id: "payment",
          status: "completed",
          processor: "manual",
          amountKurus: 12_000,
          refundedKurus: 0,
          metadata: {},
        },
      ],
      [{ debtId: "debt", amountKurus: 1_000 }],
      [{ ...debt, paidKurus: 1_000, status: "cancelled" }],
    ]);
    await repo.voidPayment("payment", "Yanlış tahsilat kaydı");
    expect(writes).toContainEqual({
      table: "debts",
      value: { paidKurus: 0, status: "cancelled" },
    });
  });
});
