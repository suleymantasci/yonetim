import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { Database } from "@yonetim/db";
import { ResidentWriteRepository } from "../apps/api/src/property/resident/resident-write.repository";
import type { DbService } from "../apps/api/src/infra/db/db.service";
import type { PiiService } from "../apps/api/src/property/resident/pii.service";

// Exercise the real lifecycle methods without requiring a running API/Postgres.
function repository(
  selectResults: unknown[][],
  updateResults: unknown[][] = [],
) {
  const deleted: { table: string; params: unknown[] }[] = [];
  const updated: { table: string; patch: unknown }[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = selectResults.shift() ?? [];
          return {
            then: (resolve: (rows: unknown[]) => void) => resolve(rows),
            limit: async () => rows,
          };
        },
      }),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (patch: unknown) => {
        updated.push({ table: getTableName(table), patch });
        return {
          where: () => ({ returning: async () => updateResults.shift() ?? [] }),
        };
      },
    }),
    insert: () => ({
      values: () => ({ returning: async () => [{ id: "new-occupancy" }] }),
    }),
    delete: (table: Parameters<typeof getTableName>[0]) => ({
      where: async (condition: SQL) => {
        deleted.push({
          table: getTableName(table),
          params: new PgDialect().sqlToQuery(condition).params,
        });
      },
    }),
  };
  const db = {
    ctx: () => ({ tenantId: "site" }),
    tx: async <T>(fn: (tx: Database) => Promise<T>) =>
      fn(tx as unknown as Database),
  };
  return {
    repo: new ResidentWriteRepository(
      db as unknown as DbService,
      {} as PiiService,
    ),
    deleted,
    updated,
  };
}

const occupancy = {
  id: "old",
  unitId: "unit-a",
  userId: "tenant-a",
  relation: "tenant",
  endDate: null,
};
const end = { endDate: new Date("2026-10-09"), transferTo: "keep" as const };
const add = {
  unitId: "unit-a",
  userId: "tenant-b",
  relation: "tenant" as const,
  ownershipPct: 100,
  startDate: new Date("2026-10-09"),
  debtTransferPolicy: "owner" as const,
};
const expectedDeletes = [
  { table: "household_members", params: ["unit-a"] },
  { table: "unit_vehicles", params: ["unit-a"] },
];

describe("resident household and vehicle lifecycle", () => {
  it.each(["keep", "owner", "next_tenant"] as const)(
    "tenant departure clears extras even with no debts (%s)",
    async (transferTo) => {
      const { repo, deleted, updated } = repository([[occupancy], []]);
      await repo.endOccupancy("old", { ...end, transferTo });
      expect(deleted).toEqual(expectedDeletes);
      expect(updated).toContainEqual({
        table: "units",
        patch: { currentTenantId: null, ownershipType: "owner" },
      });
    },
  );

  it("ending ownership preserves the occupying family's records", async () => {
    const { repo, deleted } = repository([
      [{ ...occupancy, relation: "owner" }],
      [],
    ]);
    await repo.endOccupancy("old", end);
    expect(deleted).toEqual([]);
  });

  it("replacing an active tenant clears the old family's records", async () => {
    const { repo, deleted } = repository([[]], [[{ id: "old" }]]);
    await repo.addOccupancy(add);
    expect(deleted).toEqual(expectedDeletes);
  });

  it("initial tenant assignment preserves records entered for that household", async () => {
    const { repo, deleted } = repository([[]], [[]]);
    await repo.addOccupancy(add);
    expect(deleted).toEqual([]);
  });

  it("removing a resident clears extras only for their active tenant units", async () => {
    const { repo, deleted } = repository(
      [[{ value: 0 }]],
      [
        [
          { unitId: "unit-a", relation: "tenant" },
          { unitId: "unit-b", relation: "owner" },
        ],
      ],
    );
    expect(await repo.remove(["tenant-a"])).toEqual({ removed: 1, skipped: 0 });
    expect(deleted).toEqual(expectedDeletes);
  });

  it("blocked resident removal preserves household and vehicles", async () => {
    const { repo, deleted, updated } = repository([[{ value: 1 }]]);
    expect(await repo.remove(["tenant-a"])).toEqual({ removed: 0, skipped: 1 });
    expect(deleted).toEqual([]);
    expect(updated).toEqual([]);
  });

  it("ending an already closed occupancy preserves the new household", async () => {
    const { repo, deleted } = repository([
      [{ ...occupancy, endDate: new Date("2026-10-01") }],
    ]);
    await expect(repo.endOccupancy("old", end)).rejects.toThrow(
      "conflict:already_ended",
    );
    expect(deleted).toEqual([]);
  });
});
