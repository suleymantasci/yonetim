import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";

import { encryptField } from "@yonetim/core/crypto";
import { closeDb, decisionBookEntries, tenants, users, withBypassRls, withTenant } from "@yonetim/db";
import { provisionDemo } from "@yonetim/demo-seed";

/**
 * Demo hesabı — kurulum ve FİZİKSEL silme (0019 `app_purge_demo_tenant`).
 *
 * Asıl güvence veritabanında: fonksiyon demo olmayan siteyi reddediyor,
 * uygulama rolü onu hiç çağıramıyor, karar defteri yalnız demo silinirken
 * DELETE'e izin veriyor. Silmeden sonra demo sitelerine ait tek satır
 * kalmamalı; demo kişileri gitmeli, gerçek kişiler kalmalı.
 */
const RUN = process.env.INTEGRATION === "1";
const KEY = "a3".repeat(32);

function cause(error: unknown): never {
  throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
}

async function purge(tenantId: string) {
  return withBypassRls(
    "test:demo-purge",
    (tx) => tx.execute(sql`SELECT app_purge_demo_tenant(${tenantId}::uuid) AS r`),
    { allowLogPurge: true },
  );
}

afterAll(async () => {
  await closeDb();
});

describe.skipIf(!RUN)("demo hesabı — kurulum ve silme", () => {
  const code = `t${Date.now().toString(36).slice(-5)}`;
  let result: Awaited<ReturnType<typeof provisionDemo>>;
  let realUserId = "";

  it("firma demosu 3 siteyi her modülü dolu kurar", async () => {
    result = await withBypassRls("test:demo-provision", (tx) =>
      provisionDemo(tx, {
        kind: "company",
        code,
        now: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        manager: { firstName: "Test", lastName: "Kişi", loginEmail: `demo-${code}@demo.tasci.cloud`, passwordHash: "scrypt$x$y" },
        phoneSlot: 9_999,
        emailDomain: "demo.tasci.cloud",
        encrypt: (plain, scope) => encryptField(plain, KEY, scope),
      }),
    );
    expect(result.tenantIds).toHaveLength(3);
    const rows = await withBypassRls("test:demo-check", (tx) =>
      tx.select({ isDemo: tenants.isDemo, unitCount: tenants.unitCount }).from(tenants).where(inArray(tenants.id, result.tenantIds)),
    );
    for (const row of rows) {
      expect(row.isDemo).toBe(true);
      expect(row.unitCount).toBeGreaterThanOrEqual(30);
      expect(row.unitCount).toBeLessThanOrEqual(50);
    }
  });

  it("demo olmayan site fiziksel silme yoluyla silinemez", async () => {
    const id = randomUUID();
    await withBypassRls("test:demo-real-site", (tx) =>
      tx.insert(tenants).values({ id, slug: `gercek-${Date.now()}`, name: "Gerçek Site", type: "apartment", unitCount: 1, status: "active", settings: {} }),
    );
    await expect(purge(id).catch(cause)).rejects.toThrow(/demo site değil/);
  });

  it("uygulama rolü silme fonksiyonunu çağıramaz", async () => {
    await expect(
      withTenant(result.tenantIds[0]!, (tx) => tx.execute(sql`SELECT app_purge_demo_tenant(${result.tenantIds[0]!}::uuid)`)).catch(cause),
    ).rejects.toThrow(/permission denied/);
  });

  it("karar defteri demo silme dışında silinemez", async () => {
    await expect(
      withBypassRls("test:demo-decision", (tx) =>
        tx.delete(decisionBookEntries).where(eq(decisionBookEntries.tenantId, result.tenantIds[0]!)),
      ).catch(cause),
    ).rejects.toThrow(/silinemez/);
  });

  it("silme sonrası demo sitelerine ait satır, demo kişisi ve firma kalmaz; gerçek kişi kalır", async () => {
    // Demo yöneticisinin panelden siteye eklediği, demodan önce var olan
    // gerçek bir kişi: üyeliği gitmeli, kendisi kalmalı.
    realUserId = randomUUID();
    await withBypassRls("test:demo-real-user", async (tx) => {
      await tx.insert(users).values({ id: realUserId, email: `gercek-${code}@example.com`, firstName: "Gerçek", createdAt: new Date(Date.now() - 400 * 86_400_000) });
      await tx.execute(sql`INSERT INTO memberships (tenant_id, user_id, role) VALUES (${result.tenantIds[0]!}::uuid, ${realUserId}::uuid, 'owner')`);
    });

    for (const id of result.tenantIds) await purge(id);

    const left = await withBypassRls("test:demo-leftover", async (tx) => {
      const tables = (await tx.execute(sql`
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'tenant_id'
      `)) as unknown as Array<{ table_name: string }>;
      const counts: Record<string, number> = {};
      for (const { table_name } of tables) {
        const [row] = (await tx.execute(
          sql`SELECT count(*)::int AS n FROM ${sql.identifier(table_name)} WHERE tenant_id = ANY(${sql.raw(`ARRAY[${result.tenantIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`,
        )) as unknown as Array<{ n: number }>;
        if (row && row.n > 0) counts[table_name] = row.n;
      }
      const [demoUsers] = (await tx.execute(
        sql`SELECT count(*)::int AS n FROM users WHERE phone LIKE '+905009999%' OR email = ${`demo-${code}@demo.tasci.cloud`}`,
      )) as unknown as Array<{ n: number }>;
      const [company] = (await tx.execute(sql`SELECT count(*)::int AS n FROM companies WHERE slug = ${`demo-${code}`}`)) as unknown as Array<{ n: number }>;
      const [site] = (await tx.execute(sql`SELECT count(*)::int AS n FROM tenants WHERE id = ANY(${sql.raw(`ARRAY[${result.tenantIds.map((id) => `'${id}'::uuid`).join(",")}]`)})`)) as unknown as Array<{ n: number }>;
      const [real] = (await tx.execute(sql`SELECT count(*)::int AS n FROM users WHERE id = ${realUserId}::uuid`)) as unknown as Array<{ n: number }>;
      return { counts, demoUsers: demoUsers!.n, company: company!.n, sites: site!.n, real: real!.n };
    });

    expect(left.counts).toEqual({});
    expect(left.sites).toBe(0);
    expect(left.demoUsers).toBe(0);
    expect(left.company).toBe(0);
    expect(left.real).toBe(1);
  });
});
