import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  announcements,
  blocks,
  closeDb,
  debts,
  memberships,
  messages,
  requests,
  sessions,
  tenants,
  unitOccupancies,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Sakin portalı — duman testi ve kapsam sınırı.
 *
 * NEDEN VAR: portal uçları yazıldıklarından beri **bir kez bile** gerçek
 * veritabanına karşı koşulmamıştı. Sonuç, `/v1/panel/portal/me` içindeki ham
 * `sql` şablonuna gömülü bir `Date`'in kullanıcıda 500 olarak patlaması oldu
 * (PROJE-DURUMU §5.9.1). `tsc` o hatayı göremiyor — `sql` şablonu `unknown`
 * alıyor — ve birim testi de göremez, çünkü hata ancak sürücü parametreyi
 * bind ederken çıkıyor. Bu yüzden test **her ucu gerçekten çağırıyor**.
 *
 * İkinci iş: kapsam sınırı. Portalın tek kuralı "her sorgu oturumdaki
 * kullanıcının kendi dairesiyle sınırlı"; bu iddia bugüne kadar yalnız elle
 * doğrulanmıştı. İki sakin kuruluyor ve birinin diğerinin verisine hiçbir
 * uçtan ulaşamadığı sınanıyor.
 *
 * Çalışan bir API gerekiyor:
 *   pnpm --filter @yonetim/api build && PORT=3100 node apps/api/dist/apps/api/src/main.js
 *   INTEGRATION=1 pnpm vitest run tests/integration/portal-scope.test.ts
 */
const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";

const TENANT = { id: randomUUID(), slug: `portal-${Date.now()}` };
const ALICE = { id: randomUUID(), unitId: "", debtId: "", requestId: "" };
const BOB = { id: randomUUID(), unitId: "", debtId: "", requestId: "" };

let aliceCookie = "";
let bobCookie = "";

/**
 * Erişilebilirlik **toplama anında** ölçülüyor, `beforeAll` içinde değil.
 *
 * Sebebi ince ama testin değerini belirliyor: mevcut entegrasyon testleri
 * API'ye ulaşamadığında her `it` içinde sessizce `return` ediyor ve suite
 * **yeşil** raporlanıyor. Yani "13 test geçti" satırı, API hiç çalışmadığında
 * da yazılıyor — tam olarak §5.9.1'i gözden kaçıran davranış. `skipIf` ile
 * atlanan test *atlandı* diye görünüyor; yeşil ile boş arasındaki fark
 * raporda duruyor.
 */
const apiReachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

/** Portalın **tamamı**: biri 500 verirse duman testi onu yakalamalı. */
const PORTAL_ENDPOINTS = [
  "/v1/panel/portal/me",
  "/v1/panel/portal/debts",
  "/v1/panel/portal/payments",
  "/v1/panel/portal/requests",
  "/v1/panel/portal/messages",
  "/v1/panel/portal/profile",
  "/v1/panel/portal/management",
  "/v1/panel/portal/announcements",
] as const;

beforeAll(async () => {
  if (!apiReachable) return;

  await withBypassRls("test:portal-setup", async (tx) => {
    await tx.insert(tenants).values({
      id: TENANT.id,
      slug: TENANT.slug,
      name: "Portal Testi",
      type: "apartment",
      unitCount: 2,
      status: "active",
      settings: {},
    });

    const [block] = await tx
      .insert(blocks)
      .values({ tenantId: TENANT.id, name: "A", floorCount: 2, unitCount: 2 })
      .returning({ id: blocks.id });

    for (const [index, person] of [ALICE, BOB].entries()) {
      const [unit] = await tx
        .insert(units)
        .values({
          tenantId: TENANT.id,
          blockId: block!.id,
          number: String(index + 1),
          floor: index + 1,
          type: "flat",
          areaM2: "100",
          landShare: "0.5",
        })
        .returning({ id: units.id });
      person.unitId = unit!.id;

      await tx.insert(users).values({
        id: person.id,
        firstName: person === ALICE ? "Ayşe" : "Bora",
        lastName: "Portal",
        phone: `+9055501${String(Date.now()).slice(-4)}${index}`,
        locale: "tr",
      });
      await tx.insert(memberships).values({
        tenantId: TENANT.id,
        userId: person.id,
        role: "owner",
        acceptedAt: new Date(),
      });
      await tx.insert(unitOccupancies).values({
        tenantId: TENANT.id,
        unitId: person.unitId,
        userId: person.id,
        relation: "owner",
        startDate: new Date(),
      });

      // Tutarlar bilerek farklı: kapsam sızarsa toplam da değişir ve test
      // "0 satır döndü" gibi belirsiz bir sonuçla değil, sayıyla yakalar.
      const [debt] = await tx
        .insert(debts)
        .values({
          tenantId: TENANT.id,
          unitId: person.unitId,
          debtorUserId: person.id,
          kind: "dues",
          description: `Aidat ${index + 1}`,
          amountKurus: (index + 1) * 100_000,
          dueDate: new Date(),
        })
        .returning({ id: debts.id });
      person.debtId = debt!.id;

      const [request] = await tx
        .insert(requests)
        .values({
          tenantId: TENANT.id,
          unitId: person.unitId,
          createdByUserId: person.id,
          code: `T-PORTAL-${index}`,
          category: "other",
          title: `Talep ${index + 1}`,
          priority: "normal",
          source: "portal",
        })
        .returning({ id: requests.id });
      person.requestId = request!.id;

      await tx.insert(messages).values({
        tenantId: TENANT.id,
        userId: person.id,
        channel: "in_app",
        direction: "in",
        body: `Mesaj ${index + 1}`,
      });
    }

    // §5.9.1'in tam olarak patlattığı sorgu bu satır olmadan boş dönerdi;
    // yayınlanmış bir duyuru olmadan test hatayı yakalayamaz.
    await tx.insert(announcements).values({
      tenantId: TENANT.id,
      title: "Portal duyurusu",
      body: "Duman testi için yayınlanmış duyuru.",
      audience: "all",
      publishedAt: new Date(),
    });
  });

  aliceCookie = (await createSession({ userId: ALICE.id, tenantId: TENANT.id })).token;
  bobCookie = (await createSession({ userId: BOB.id, tenantId: TENANT.id })).token;
});

afterAll(async () => {
  if (apiReachable) {
    const ids = [ALICE.id, BOB.id];
    await withBypassRls("test:portal-cleanup", async (tx) => {
      await tx.delete(sessions).where(inArray(sessions.userId, ids));
      await tx.delete(messages).where(inArray(messages.userId, ids));
      await tx.delete(requests).where(inArray(requests.createdByUserId, ids));
      await tx.delete(debts).where(inArray(debts.debtorUserId, ids));
      await tx.delete(unitOccupancies).where(inArray(unitOccupancies.userId, ids));
      await tx.delete(announcements).where(eq(announcements.tenantId, TENANT.id));
      await tx.delete(memberships).where(inArray(memberships.userId, ids));
      await tx.delete(units).where(eq(units.tenantId, TENANT.id));
      await tx.delete(blocks).where(eq(blocks.tenantId, TENANT.id));
      await tx.delete(users).where(inArray(users.id, ids));
      await tx.delete(tenants).where(eq(tenants.id, TENANT.id));
    });
  }
  await closeDb();
});

function asResident(token: string) {
  return { cookie: `${SESSION_COOKIE}=${token}`, "x-tenant-slug": TENANT.slug };
}

async function get(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, { headers: asResident(token) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe.skipIf(!apiReachable)("sakin portalı — duman testi", () => {
  it.each(PORTAL_ENDPOINTS)("%s 200 dönüyor", async (path) => {
    const { status, body } = await get(path, aliceCookie);
    // Hata gövdesini teste yazdırmak, 500'ün sebebini log aramadan gösteriyor.
    expect({ path, status, body: status === 200 ? "ok" : body }).toMatchObject({
      status: 200,
    });
  });

  it("özet sakinin kendi dairesini ve yayınlanmış duyuruyu getiriyor", async () => {
    const { body } = await get("/v1/panel/portal/me", aliceCookie);

    expect((body.unit as { number: string } | null)?.number).toBe("1");
    expect((body.totals as { outstandingMinor: number }).outstandingMinor).toBe(100_000);
    expect(body.announcements).toHaveLength(1);
  });
});

describe.skipIf(!apiReachable)("sakin portalı — kapsam sınırı", () => {
  it("borç dökümü yalnız kendi dairesini içeriyor", async () => {

    const alice = await get("/v1/panel/portal/debts", aliceCookie);
    const bob = await get("/v1/panel/portal/debts", bobCookie);

    expect((alice.body.rows as { id: string }[]).map((r) => r.id)).toEqual([ALICE.debtId]);
    expect((bob.body.rows as { id: string }[]).map((r) => r.id)).toEqual([BOB.debtId]);
    expect((alice.body.totals as { outstandingMinor: number }).outstandingMinor).toBe(100_000);
    expect((bob.body.totals as { outstandingMinor: number }).outstandingMinor).toBe(200_000);
  });

  it("talep listesi ve detayı komşunun kaydını sızdırmıyor", async () => {

    const list = await get("/v1/panel/portal/requests", aliceCookie);
    expect((list.body.rows as { id: string }[]).map((r) => r.id)).toEqual([ALICE.requestId]);

    // 403 değil 404: 403 "böyle bir kayıt var ama senin değil" bilgisini
    // sızdırırdı (§5.8.2).
    const foreign = await get(`/v1/panel/portal/requests/${BOB.requestId}`, aliceCookie);
    expect(foreign.status).toBe(404);
  });

  it("yazışma yalnız kendi mesajlarını döndürüyor", async () => {

    const { body } = await get("/v1/panel/portal/messages", aliceCookie);
    const bodies = (body.rows as { body: string | null }[]).map((r) => r.body);
    expect(bodies).toEqual(["Mesaj 1"]);
  });

  it("sakin yönetim mesaj ucuna erişemiyor", async () => {

    // §5.8.1'de kapatılan açık: `message:read` sakinde yok, bu uç site
    // genelindeki tüm yazışmaları döndürüyor.
    const { status } = await get("/v1/panel/communication/messages", aliceCookie);
    expect(status).toBe(403);
  });
});
