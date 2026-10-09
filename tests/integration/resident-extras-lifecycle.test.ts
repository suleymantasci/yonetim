import { afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, unitOccupancies, withBypassRls } from "@yonetim/db";
import { apiReachable, createSite, type TestSite } from "./_site";

let site: TestSite;
let occupancyId: string;

beforeEach(async () => {
  if (!apiReachable) return;
  site = await createSite("extras-lifecycle", 2);
  occupancyId = await withBypassRls("test:occupancy-id", async (tx) => {
    const [row] = await tx
      .select({ id: unitOccupancies.id })
      .from(unitOccupancies)
      .where(
        and(
          eq(unitOccupancies.tenantId, site.tenantId),
          eq(unitOccupancies.userId, site.tenantResidentId),
        ),
      );
    return row!.id;
  });
  for (const u of site.unitIds) {
    expect(
      (
        await site.call("POST", `/v1/panel/units/${u}/household`, {
          fullName: "Kiracı Çocuğu",
          relation: "child",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await site.call("POST", `/v1/panel/units/${u}/vehicles`, {
          plate: u === site.unitIds[0] ? "34 ABC 123" : "06 DEF 456",
        })
      ).status,
    ).toBe(201);
  }
});
afterEach(async () => {
  if (apiReachable && site) await site.cleanup();
});
afterAll(async () => {
  await closeDb();
});

async function extras(index = 0) {
  const res = await site.call(
    "GET",
    `/v1/panel/units/${site.unitIds[index]}/extras`,
  );
  expect(res.status).toBe(200);
  return res.body;
}

async function expectCleared() {
  expect(await extras()).toEqual({ household: [], vehicles: [] });
  const other = await extras(1);
  expect(other.household).toHaveLength(1);
  expect(other.vehicles).toHaveLength(1);
  expect(
    (await site.call("GET", "/v1/panel/units/vehicles?plate=34ABC123")).body
      .rows,
  ).toEqual([]);
}

const end = { endDate: "2026-10-09T00:00:00.000Z", transferTo: "keep" };
const add = () => ({
  userId: site.ownerIds[1],
  unitId: site.unitIds[0],
  relation: "tenant",
  startDate: end.endDate,
});

describe.skipIf(!apiReachable)("tenant extras lifecycle with Postgres", () => {
  it.each(["keep", "owner", "next_tenant"])(
    "departure clears only the departing unit (%s)",
    async (transferTo) => {
      expect(
        (
          await site.call(
            "PATCH",
            `/v1/panel/residents/occupancy/${occupancyId}/end`,
            { ...end, transferTo },
          )
        ).status,
      ).toBe(200);
      await expectCleared();
      expect(
        (await site.call("POST", "/v1/panel/residents/occupancy", add()))
          .status,
      ).toBe(201);
      expect(await extras()).toEqual({ household: [], vehicles: [] });
      // Deleted plates are available to register again.
      expect(
        (
          await site.call(
            "POST",
            `/v1/panel/units/${site.unitIds[0]}/vehicles`,
            { plate: "34 ABC 123" },
          )
        ).status,
      ).toBe(201);
    },
  );

  it("direct replacement clears the previous tenant's extras", async () => {
    expect(
      (await site.call("POST", "/v1/panel/residents/occupancy", add())).status,
    ).toBe(201);
    await expectCleared();
  });

  it("resident removal also clears the departing tenant's extras", async () => {
    expect(
      (
        await site.call("POST", "/v1/panel/residents/remove", {
          ids: [site.tenantResidentId],
        })
      ).body.removed,
    ).toBe(1);
    await expectCleared();
  });

  it("failed debt transfer rolls back departure and extras deletion", async () => {
    await withBypassRls("test:no-owner", (tx) =>
      tx
        .update(unitOccupancies)
        .set({ endDate: new Date("2026-10-01") })
        .where(
          and(
            eq(unitOccupancies.tenantId, site.tenantId),
            eq(unitOccupancies.unitId, site.unitIds[0]!),
            eq(unitOccupancies.relation, "owner"),
          ),
        ),
    );
    expect(
      (
        await site.call("POST", "/v1/panel/debts", {
          unitId: site.unitIds[0],
          kind: "dues",
          description: "Kiracı borcu",
          amountMinor: 1000,
          dueDate: end.endDate,
          shareTarget: "tenant",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await site.call(
          "PATCH",
          `/v1/panel/residents/occupancy/${occupancyId}/end`,
          { ...end, transferTo: "owner" },
        )
      ).status,
    ).toBe(409);
    const current = await extras();
    expect(current.household).toHaveLength(1);
    expect(current.vehicles).toHaveLength(1);
    // A successful retry proves the relationship was rolled back as well.
    expect(
      (
        await site.call(
          "PATCH",
          `/v1/panel/residents/occupancy/${occupancyId}/end`,
          end,
        )
      ).status,
    ).toBe(200);
    await expectCleared();
  });
});
