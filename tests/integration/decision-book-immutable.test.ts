import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, decisionBookEntries, tenants, withBypassRls } from "@yonetim/db";

/**
 * KMK md.32 — karar defterine yazılan karar değiştirilemez; düzeltme yeni
 * kayıtla yapılır. Kural veritabanında (0006 `trg_decision_book_immutable`):
 * BYPASSRLS yetkili rol bile karar metnini güncelleyemiyor ve kaydı
 * silemiyor; noter tasdikinden sonra dolan sayfa numarası güncellenebiliyor.
 *
 * Temizlik yok: kayıt tanımı gereği silinemiyor (site satırı da ona bağlı).
 * Entegrasyon veritabanı her CI koşusunda sıfırdan kuruluyor.
 */
const RUN = process.env.INTEGRATION === "1";
const TENANT = { id: randomUUID(), slug: `karar-${Date.now()}` };
let entryId = "";

function cause(error: unknown): never {
  throw error instanceof Error && error.cause instanceof Error ? error.cause : error;
}

beforeAll(async () => {
  if (!RUN) return;
  await withBypassRls("test:decision-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id, slug: TENANT.slug, name: "Karar Defteri Testi",
      type: "apartment", unitCount: 1, status: "active", settings: {},
    });
    const [row] = await tx
      .insert(decisionBookEntries)
      .values({
        tenantId: TENANT.id,
        entryNo: 1,
        decidedAt: new Date("2026-09-01"),
        subject: "Çatı onarımı",
        body: "Çatı onarımına oy çokluğuyla karar verildi.",
      })
      .returning({ id: decisionBookEntries.id });
    entryId = row!.id;
  });
});

afterAll(async () => {
  await closeDb();
});

describe.skipIf(!RUN)("karar defteri değiştirilemez", () => {
  it("yetkili rol bile kararı güncelleyemiyor", async () => {
    await expect(
      withBypassRls("test:decision-update", async (tx) => {
        await tx
          .update(decisionBookEntries)
          .set({ body: "Geriye dönük değiştirilmiş karar" })
          .where(eq(decisionBookEntries.id, entryId));
      }).catch(cause),
    ).rejects.toThrow(/değiştirilemez/i);
  });

  it("noter tasdiki sonrası sayfa numarası yazılabiliyor", async () => {
    await withBypassRls("test:decision-page", async (tx) => {
      await tx
        .update(decisionBookEntries)
        .set({ bookPageNo: 12 })
        .where(eq(decisionBookEntries.id, entryId));
    });
    const [row] = await withBypassRls("test:decision-read", async (tx) =>
      tx.select({ page: decisionBookEntries.bookPageNo }).from(decisionBookEntries).where(eq(decisionBookEntries.id, entryId)),
    );
    expect(row?.page).toBe(12);
  });

  it("kayıt silinemiyor", async () => {
    await expect(
      withBypassRls("test:decision-delete", async (tx) => {
        await tx.delete(decisionBookEntries).where(eq(decisionBookEntries.id, entryId));
      }).catch(cause),
    ).rejects.toThrow(/silinemez/i);
  });
});
