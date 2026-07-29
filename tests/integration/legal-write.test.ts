import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  blocks,
  closeDb,
  debts,
  legalCaseEvents,
  legalCases,
  memberships,
  sessions,
  tenants,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * İcra/hukuk yazma döngüsü — PROJE-DURUMU §5.5.
 *
 * NEDEN ENTEGRASYON: modülün okuma ucu aylardır vardı, yazma ucu yoktu ve
 * dolayısıyla **hiç** çalıştırılmamıştı. Buradaki riskler tam da birim
 * testinin göremeyeceği türden: drizzle'ın enum kolonuna yazması, `+` ile
 * artımlı güncellemenin gerçekten SQL tarafında toplanması, RLS altında
 * dosya kütüğüne yazabilmek ve aynı daireye ikinci dosya açılmasını engelleyen
 * kısıtın gerçekten tutması.
 *
 * Çalışan bir API gerekiyor:
 *   INTEGRATION=1 pnpm vitest run tests/integration/legal-write.test.ts
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";

const TENANT = { id: randomUUID(), slug: `legal-${Date.now()}` };
const MANAGER = randomUUID();
let unitId = "";
let cookie = "";
let caseId = "";

const apiReachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

beforeAll(async () => {
  if (!apiReachable) return;

  await withBypassRls("test:legal-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id,
      slug: TENANT.slug,
      name: "Hukuk Testi",
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
        number: "3",
        floor: 1,
        type: "flat",
        areaM2: "90",
        landShare: "1",
      })
      .returning({ id: units.id });
    unitId = unit!.id;

    await tx.insert(users).values({
      id: MANAGER,
      firstName: "Yönetici",
      lastName: "Hukuk",
      phone: `+9055502${String(Date.now()).slice(-5)}`,
      locale: "tr",
    });
    await tx.insert(memberships).values({
      tenantId: TENANT.id,
      userId: MANAGER,
      role: "manager",
      acceptedAt: new Date(),
    });

    // İki borç: biri kısmen ödenmiş. Ana paranın **kalan** üzerinden
    // toplandığını sınayabilmek için.
    await tx.insert(debts).values([
      {
        tenantId: TENANT.id,
        unitId,
        kind: "dues",
        description: "Aidat 1",
        amountKurus: 100_000,
        lateFeeKurus: 5_000,
        dueDate: new Date("2026-01-10"),
      },
      {
        tenantId: TENANT.id,
        unitId,
        kind: "dues",
        description: "Aidat 2",
        amountKurus: 100_000,
        paidKurus: 40_000,
        lateFeeKurus: 3_000,
        status: "partial",
        dueDate: new Date("2026-02-10"),
      },
    ]);
  });

  cookie = (await createSession({ userId: MANAGER, tenantId: TENANT.id })).token;
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:legal-cleanup", async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, MANAGER));
      await tx.delete(legalCaseEvents).where(eq(legalCaseEvents.tenantId, TENANT.id));
      await tx.delete(legalCases).where(eq(legalCases.tenantId, TENANT.id));
      await tx.delete(debts).where(eq(debts.tenantId, TENANT.id));
      await tx.delete(memberships).where(inArray(memberships.userId, [MANAGER]));
      await tx.delete(units).where(eq(units.tenantId, TENANT.id));
      await tx.delete(blocks).where(eq(blocks.tenantId, TENANT.id));
      await tx.delete(users).where(eq(users.id, MANAGER));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

function headers() {
  return {
    cookie: `${SESSION_COOKIE}=${cookie}`,
    "x-tenant-slug": TENANT.slug,
    "content-type": "application/json",
  };
}

async function send(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!apiReachable)("icra dosyası — yazma döngüsü", () => {
  it("dosya açılıyor ve tutarlar açık borçlardan toplanıyor", async () => {
    const created = await send("POST", "/v1/panel/legal", {
      unitId,
      caseNo: "2026/123",
    });
    expect(created.status).toBe(201);
    caseId = String(created.body.id);

    const list = await send("GET", "/v1/panel/legal");
    const row = (list.body.rows as { id: string; principalMinor: number; interestMinor: number }[])
      .find((r) => r.id === caseId);

    /*
     * Ana para **kalan** üzerinden: 100.000 + (100.000 − 40.000) = 160.000.
     * Ödenen kısmı da dosyaya yazsaydık, tahsil edilmiş parayı ikinci kez
     * takibe koymuş olurduk.
     */
    expect(row?.principalMinor).toBe(160_000);
    // Gecikme tazminatı ayrı kolonda: icra talebinde de ayrı kalem.
    expect(row?.interestMinor).toBe(8_000);
  });

  it("aynı daireye ikinci açık dosya açılamıyor", async () => {
    const second = await send("POST", "/v1/panel/legal", { unitId });
    expect(second.status).toBe(409);
  });

  it("aşama değişikliği dosya kütüğüne yazılıyor", async () => {
    const before = await eventCount();

    const updated = await send("PATCH", `/v1/panel/legal/${caseId}`, {
      stage: "enforcement",
      nextActionNote: "Haciz talebi",
    });
    expect(updated.status).toBe(200);
    expect(await eventCount()).toBe(before + 1);

    // Aynı aşama yeniden gönderilirse kütüğe **yazılmıyor**: gürültü olurdu.
    await send("PATCH", `/v1/panel/legal/${caseId}`, { stage: "enforcement" });
    expect(await eventCount()).toBe(before + 1);
  });

  it("tahsilat ve masraf artımlı işleniyor", async () => {
    await send("POST", `/v1/panel/legal/${caseId}/amounts`, {
      kind: "collection",
      amountMinor: 30_000,
    });
    await send("POST", `/v1/panel/legal/${caseId}/amounts`, {
      kind: "collection",
      amountMinor: 20_000,
    });
    await send("POST", `/v1/panel/legal/${caseId}/amounts`, {
      kind: "cost",
      amountMinor: 5_000,
    });

    const list = await send("GET", "/v1/panel/legal");
    const row = (list.body.rows as { id: string; collectedMinor: number; costsMinor: number }[])
      .find((r) => r.id === caseId);

    // Asıl güvence: ikinci tahsilat birincisini **ezmiyor**. Mutlak yazma
    // olsaydı burada 20.000 görürdük ve 30.000 kaybolurdu.
    expect(row?.collectedMinor).toBe(50_000);
    expect(row?.costsMinor).toBe(5_000);
  });

  it("kapatma gerekçe istiyor ve kapanan dosya güncellenmiyor", async () => {
    const short = await send("POST", `/v1/panel/legal/${caseId}/close`, {
      reason: "kısa",
    });
    expect(short.status).toBeGreaterThanOrEqual(400);

    const closed = await send("POST", `/v1/panel/legal/${caseId}/close`, {
      reason: "Borç tamamen tahsil edildi, dosya kapatıldı.",
    });
    expect(closed.status).toBe(201);

    const afterClose = await send("PATCH", `/v1/panel/legal/${caseId}`, {
      stage: "seizure",
    });
    expect(afterClose.status).toBeGreaterThanOrEqual(400);
  });

  it("başka bir sitenin dosyası görünmüyor", async () => {
    const missing = await send("PATCH", `/v1/panel/legal/${randomUUID()}`, {
      stage: "lawsuit",
    });
    expect(missing.status).toBe(404);
  });
});

/**
 * Belge yükleme — depo kurulu değilken.
 *
 * CI'da ve geliştirme ortamında R2 kimlik bilgileri yok. Buradaki iddia
 * "yükleme çalışıyor" değil, **kurulu olmadığında düzgün davranıyor**: uç
 * 500 vermiyor, anlaşılır bir sebep dönüyor ve liste ekranı `uploadEnabled`
 * ile yükleme kutusunu hiç göstermiyor.
 */
describe.skipIf(!apiReachable)("belge yükleme — depo kurulu değilken", () => {
  it("liste uploadEnabled: false dönüyor", async () => {
    const { status, body } = await send("GET", "/v1/panel/documents");
    expect(status).toBe(200);
    expect(body.uploadEnabled).toBe(false);
  });

  it("yükleme adresi istemek anlaşılır bir hata veriyor", async () => {
    const { status, body } = await send("POST", "/v1/panel/documents/upload-url", {
      fileName: "sozlesme.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    expect(JSON.stringify(body)).toContain("storage_not_configured");
  });

  it("kabul edilmeyen tür reddediliyor", async () => {
    // Beyaz liste kontrolü depodan **önce** çalışıyor; HTML bilerek listede
    // değil (script taşıyabiliyor).
    const { status } = await send("POST", "/v1/panel/documents/upload-url", {
      fileName: "sayfa.html",
      contentType: "text/html",
      sizeBytes: 1024,
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

async function eventCount(): Promise<number> {
  return withBypassRls("test:legal-events", async (tx) => {
    const rows = await tx
      .select({ id: legalCaseEvents.id })
      .from(legalCaseEvents)
      .where(eq(legalCaseEvents.caseId, caseId));
    return rows.length;
  });
}
