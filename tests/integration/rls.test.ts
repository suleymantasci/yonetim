import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

import { currentPeriod, periodKey, tlToKurus } from "@yonetim/core";
import {
  auditLogs, blocks, closeDb, debtChanges, debts, duesPlans, getDb, tenants, units,
  withBypassRls, withPlatform, withTenant,
} from "@yonetim/db";
import { applyLateFees, generateDuesForTenant } from "@yonetim/jobs";

/**
 * Entegrasyon testleri — SPEC Bölüm 21.2 kabul kriterleri.
 * Gerçek Postgres gerektirir: docker compose -f infra/docker/docker-compose.yml up -d
 * Çalıştırma: pnpm test:integration
 */
const A = { id: randomUUID(), slug: `test-a-${Date.now()}` };
const B = { id: randomUUID(), slug: `test-b-${Date.now()}` };

let aUnitId = "";
let bUnitId = "";

beforeAll(async () => {
  await withBypassRls("test:setup", async (tx) => {
    for (const t of [A, B]) {
      await tx.insert(tenants).values({
        id: t.id,
        slug: t.slug,
        name: `Test ${t.slug}`,
        type: "apartment",
        unitCount: 2,
        status: "active",
        settings: { duesDueDayOfMonth: 10, lateFeeEnabled: true, lateFeeMonthlyPct: 5 },
      });
      const [block] = await tx
        .insert(blocks)
        .values({ tenantId: t.id, name: "A", floorCount: 2, unitCount: 2 })
        .returning({ id: blocks.id });

      for (const [i, no] of ["1", "2"].entries()) {
        const [unit] = await tx
          .insert(units)
          .values({
            tenantId: t.id,
            blockId: block!.id,
            number: no,
            floor: i + 1,
            type: "flat",
            areaM2: "100",
            landShare: "0.5",
          })
          .returning({ id: units.id });
        if (t === A && no === "1") aUnitId = unit!.id;
        if (t === B && no === "1") bUnitId = unit!.id;
      }

      await tx.insert(duesPlans).values({
        tenantId: t.id,
        name: "Aylık Aidat",
        period: "monthly",
        formula: "equal",
        baseAmountKurus: tlToKurus(1_000),
        dueDayOfMonth: 10,
        startPeriod: periodKey(currentPeriod()),
        isActive: true,
      });
    }
  });
});

afterAll(async () => {
  // Site kaydının tamamen kaldırılması kütük satırlarını da siler; bu yalnızca
  // yetkili rol + açık imha izniyle mümkündür (KVKK saklama süresi imhası).
  await withBypassRls(
    "test:teardown",
    async (tx) => {
      await tx.delete(tenants).where(eq(tenants.id, A.id));
      await tx.delete(tenants).where(eq(tenants.id, B.id));
    },
    { allowLogPurge: true },
  );
  await closeDb();
});

/**
 * drizzle-orm ≥0.44 veritabanı hatasını `DrizzleQueryError` ("Failed query:
 * …") içine sarıyor; trigger'ın asıl mesajı `cause`'da. Testler mesajın
 * kendisini doğruluyor, sarmalayıcıyı değil.
 */
function dbCause(error: unknown): never {
  throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
}

describe("multi-tenant izolasyon (SPEC 21.2)", () => {
  it("tenant A yalnızca kendi birimlerini görür", async () => {
    const rows = await withTenant(A.id, async (tx) => tx.select().from(units));
    expect(rows).toHaveLength(2);
    expect(rows.every((u) => u.tenantId === A.id)).toBe(true);
  });

  it("tenant B, A'nın birimini id ile bile okuyamaz", async () => {
    const rows = await withTenant(B.id, async (tx) =>
      tx.select().from(units).where(eq(units.id, aUnitId)),
    );
    expect(rows).toHaveLength(0);
  });

  // Simetrik yön de kanıtlanmalı: izolasyon tek taraflı olsaydı testler yeşil
  // kalırken B'nin verisi A'ya sızıyor olurdu (MIMARI-PLAN §15 "RLS gerçekten
  // çalışıyor" kapısı).
  it("tenant A, B'nin birimini id ile bile okuyamaz", async () => {
    const rows = await withTenant(A.id, async (tx) =>
      tx.select().from(units).where(eq(units.id, bUnitId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("tenant B, A'nın kaydını güncelleyemez", async () => {
    await withTenant(B.id, async (tx) => {
      await tx.update(units).set({ notes: "sızma denemesi" }).where(eq(units.id, aUnitId));
    });
    const [row] = await withTenant(A.id, async (tx) =>
      tx.select().from(units).where(eq(units.id, aUnitId)),
    );
    expect(row?.notes).toBeNull();
  });

  it("tenant B, A'nın kaydını silemez", async () => {
    await withTenant(B.id, async (tx) => {
      await tx.delete(units).where(eq(units.id, aUnitId));
    });
    const rows = await withTenant(A.id, async (tx) =>
      tx.select().from(units).where(eq(units.id, aUnitId)),
    );
    expect(rows).toHaveLength(1);
  });

  it("başka tenant'ın id'siyle satır eklenemez (WITH CHECK)", async () => {
    await expect(
      withTenant(B.id, async (tx) => {
        await tx.insert(units).values({
          tenantId: A.id,
          number: "999",
          floor: 1,
          type: "flat",
        });
      }),
    ).rejects.toThrow();
  });

  it("tenant bağlamı yoksa hiçbir satır dönmez (fail-closed)", async () => {
    const rows = await withPlatform(async (tx) => tx.select().from(units));
    expect(rows).toHaveLength(0);
  });
});

describe("otomatik borç üretimi (SPEC 6.1 / Faz 3)", () => {
  it("aktif plana göre her birime borç üretir", async () => {
    const results = await generateDuesForTenant({ tenantId: A.id });
    expect(results).toHaveLength(1);
    expect(results[0]!.skipped).toBe(false);
    expect(results[0]!.generated).toBe(2);
    expect(results[0]!.totalKurus).toBe(tlToKurus(2_000));

    const rows = await withTenant(A.id, async (tx) => tx.select().from(debts));
    expect(rows).toHaveLength(2);
    expect(rows.every((d) => d.amountKurus === tlToKurus(1_000))).toBe(true);
  });

  it("aynı dönem ikinci kez üretilmez (idempotent)", async () => {
    const results = await generateDuesForTenant({ tenantId: A.id });
    expect(results[0]!.skipped).toBe(true);
    expect(results[0]!.reason).toContain("idempotent");

    const rows = await withTenant(A.id, async (tx) => tx.select().from(debts));
    expect(rows).toHaveLength(2);
  });

  it("A'nın borçları B'den görünmez", async () => {
    const rows = await withTenant(B.id, async (tx) => tx.select().from(debts));
    expect(rows).toHaveLength(0);
  });
});

describe("gecikme tazminatı ve değişiklik kütüğü", () => {
  it("vadesi geçen borca KMK md.20 tazminatı işler (1 aylık gecikme)", async () => {
    // Vadeyi 20 gün geriye çekerek tek aylık gecikme oluştur (ceil(20/30) = 1).
    await withTenant(A.id, async (tx) => {
      await tx.execute(sql`UPDATE debts SET due_date = now() - interval '20 days'`);
    });

    const result = await applyLateFees({ tenantId: A.id });
    expect(result.processed).toBe(2);
    expect(result.totalFeeKurus).toBe(tlToKurus(100)); // 2 daire × 1.000₺ × %5 × 1 ay

    const rows = await withTenant(A.id, async (tx) => tx.select().from(debts));
    expect(rows.every((d) => d.status === "overdue")).toBe(true);
    expect(rows.every((d) => d.lateFeeKurus === tlToKurus(50))).toBe(true);
  });

  it("gecikme uzadıkça tazminat aylık olarak katlanır", async () => {
    await withTenant(A.id, async (tx) => {
      await tx.execute(sql`UPDATE debts SET due_date = now() - interval '40 days'`);
    });

    const result = await applyLateFees({ tenantId: A.id });
    // 40 gün → 2 aylık dilim: 2 daire × 1.000₺ × %5 × 2 ay = 200₺
    expect(result.totalFeeKurus).toBe(tlToKurus(200));

    const rows = await withTenant(A.id, async (tx) => tx.select().from(debts));
    expect(rows.every((d) => d.lateFeeKurus === tlToKurus(100))).toBe(true);
  });

  it("vade değişikliği de timeline'a yazılır", async () => {
    const changes = await withTenant(A.id, async (tx) =>
      tx.select().from(debtChanges).where(eq(debtChanges.changeType, "due_date_changed")),
    );
    // Yukarıdaki iki testte vade iki kez değişti → 2 borç × 2 değişiklik.
    expect(changes.length).toBeGreaterThanOrEqual(2);
    expect(changes.every((c) => c.oldDueDate !== null && c.newDueDate !== null)).toBe(true);
  });

  it("tutar değişikliği otomatik olarak timeline'a yazılır (trigger)", async () => {
    const [debt] = await withTenant(A.id, async (tx) => tx.select().from(debts).limit(1));

    await withTenant(A.id, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.change_reason', 'test zammı', true)`);
      await tx
        .update(debts)
        .set({ amountKurus: tlToKurus(1_200) })
        .where(eq(debts.id, debt!.id));
    });

    const changes = await withTenant(A.id, async (tx) =>
      tx
        .select()
        .from(debtChanges)
        .where(
          and(eq(debtChanges.debtId, debt!.id), eq(debtChanges.changeType, "amount_changed")),
        ),
    );
    expect(changes).toHaveLength(1);
    expect(Number(changes[0]!.oldAmountKurus)).toBe(tlToKurus(1_000));
    expect(Number(changes[0]!.newAmountKurus)).toBe(tlToKurus(1_200));
    expect(changes[0]!.reason).toBe("test zammı");
    expect(changes[0]!.visibleToResident).toBe(true);
  });

  it("değişiklik kütüğü değiştirilemez (append-only)", async () => {
    const [change] = await withTenant(A.id, async (tx) => tx.select().from(debtChanges).limit(1));
    await expect(
      withTenant(A.id, async (tx) => {
        await tx
          .update(debtChanges)
          .set({ reason: "geçmişi değiştirme denemesi" })
          .where(eq(debtChanges.id, change!.id));
      }).catch(dbCause),
    ).rejects.toThrow(/append-only/i);
  });

  it("kütük yetkili rolle bile imha izni olmadan silinemez", async () => {
    await withBypassRls("test:audit-insert", async (tx) => {
      await tx.insert(auditLogs).values({ tenantId: A.id, action: "test", resource: "unit" });
    });

    await expect(
      withBypassRls("test:audit-delete", async (tx) => {
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, A.id));
      }).catch(dbCause),
    ).rejects.toThrow(/silinemez/i);
  });

  it("uygulama rolü kütüğü hiçbir koşulda silemez", async () => {
    await expect(
      withTenant(A.id, async (tx) => {
        await tx.execute(sql`SELECT set_config('app.allow_log_purge', 'on', true)`);
        await tx.delete(debtChanges);
      }).catch(dbCause),
    ).rejects.toThrow(/silinemez/i);
  });

  it("KVKK saklama süresi imhası yetkili rolle yapılabilir", async () => {
    const before = await withBypassRls("test:count", async (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.tenantId, A.id)),
    );
    expect(before.length).toBeGreaterThan(0);

    await withBypassRls(
      "kvkk:retention-purge",
      async (tx) => {
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, A.id));
      },
      { allowLogPurge: true },
    );

    const after = await withBypassRls("test:count-after", async (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.tenantId, A.id)),
    );
    expect(after).toHaveLength(0);
  });
});

describe("rezervasyon çakışma koruması (SPEC 6.7)", () => {
  it("aynı kaynakta çakışan onaylı rezervasyon eklenemez", async () => {
    const db = getDb();
    const resourceId = randomUUID();
    const userId = randomUUID();

    await withBypassRls("test:reservation-setup", async (tx) => {
      await tx.execute(sql`
        INSERT INTO resources (id, tenant_id, name, kind, fee_kurus, fee_unit)
        VALUES (${resourceId}, ${A.id}, 'Salon', 'salon', 0, 'hour')
      `);
      await tx.execute(sql`
        INSERT INTO users (id, first_name, last_name) VALUES (${userId}, 'Test', 'Sakin')
      `);
      await tx.execute(sql`
        INSERT INTO reservations (tenant_id, resource_id, user_id, start_at, end_at, status)
        VALUES (${A.id}, ${resourceId}, ${userId},
                '2026-06-01 14:00:00+03', '2026-06-01 18:00:00+03', 'approved')
      `);
    });

    await expect(
      withBypassRls("test:reservation-overlap", async (tx) => {
        await tx.execute(sql`
          INSERT INTO reservations (tenant_id, resource_id, user_id, start_at, end_at, status)
          VALUES (${A.id}, ${resourceId}, ${userId},
                  '2026-06-01 16:00:00+03', '2026-06-01 20:00:00+03', 'approved')
        `);
      }),
    ).rejects.toThrow();

    // Çakışmayan saat kabul edilir.
    await expect(
      withBypassRls("test:reservation-ok", async (tx) => {
        await tx.execute(sql`
          INSERT INTO reservations (tenant_id, resource_id, user_id, start_at, end_at, status)
          VALUES (${A.id}, ${resourceId}, ${userId},
                  '2026-06-01 19:00:00+03', '2026-06-01 21:00:00+03', 'approved')
        `);
      }),
    ).resolves.not.toThrow();

    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  });
});
