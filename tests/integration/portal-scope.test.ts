import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";

import { createSession, issueVerificationToken, SESSION_COOKIE } from "@yonetim/auth";
import {
  announcements,
  blocks,
  closeDb,
  debts,
  memberships,
  messages,
  pollVotes,
  polls,
  requests,
  sessions,
  tenants,
  unitOccupancies,
  units,
  users,
  verificationTokens,
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
  "/v1/panel/portal/payment",
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
      // Telefon testlerinin bıraktığı doğrulama kayıtları: süreleri zaten
      // doluyor ama test kendi çöpünü toplasın.
      await tx
        .delete(verificationTokens)
        .where(
          and(
            eq(verificationTokens.purpose, "phone_change"),
            inArray(sql`${verificationTokens.metadata}->>'userId'`, ids),
          ),
        );
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

async function postJson(path: string, token: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...asResident(token), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Hata zarfındaki ayrıntı kodu — `validation_failed:already_voted` gibi. */
function errorHint(body: Record<string, unknown>): string {
  const error = body.error as { details?: { hint?: string } } | undefined;
  return error?.details?.hint ?? "";
}

/** Oylama satırının teste konu olan alanları. */
interface PollView {
  id: string;
  canVote: boolean;
  myVote: string[];
  blockedReason: string | null;
  result: unknown;
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

  it("kartla ödeme varsayılan olarak kapalı ve sebebi söyleniyor", async () => {
    // Site ayarında `payment` anahtarı hiç yok: yönetim online tahsilatı
    // açmamış sayılır. Sakine "ödeyemezsiniz" demek yetmiyor — ne yapacağını
    // söyleyen sebep de dönmeli.
    const { body } = await get("/v1/panel/portal/payment", aliceCookie);
    expect(body.online).toEqual({ available: false, reason: "not_enabled" });
  });

  it("ödeme özeti yalnız kendi dairesinin borcunu topluyor", async () => {
    const alice = await get("/v1/panel/portal/payment", aliceCookie);
    const bob = await get("/v1/panel/portal/payment", bobCookie);

    expect((alice.body.fees as { amountMinor: number }).amountMinor).toBe(100_000);
    expect((bob.body.fees as { amountMinor: number }).amountMinor).toBe(200_000);
    /*
     * Test ortamında komisyon oranı tanımlı değil (CI'da da değil), o yüzden
     * kırılım hiç hesaplanmıyor ve ödenecek tutar borcun kendisi. Uydurma bir
     * oranla dolu bir kırılım göstermektense hesaplamamak: kartla ödeme zaten
     * kapalı olduğu için bu tutarla bir tahsilat başlatılamıyor.
     */
    expect((alice.body.fees as { totalMinor: number }).totalMinor).toBe(100_000);
  });

  it("yönetim açsa da sağlayıcı kurulu değilse sebep değişiyor", async () => {
    /*
     * İki katman ayrı ayrı çalışıyor mu: ayar açıldığında sebep artık
     * "yönetiminiz açmamış" değil "altyapı yok" olmalı. Tek bir
     * `available: false` bu ikisini ayırt edemezdi ve sakin, çözümü
     * yöneticide olmayan bir sorun için yöneticiye giderdi.
     *
     * Test ortamında iyzico kimlik bilgileri yok — CI'da da yok, o yüzden
     * beklenti sabit.
     */
    await withBypassRls("test:portal-enable-payment", async (tx) => {
      await tx
        .update(tenants)
        .set({ settings: { payment: { onlineEnabled: true } } })
        .where(eq(tenants.id, TENANT.id));
    });

    const { body } = await get("/v1/panel/portal/payment", aliceCookie);
    expect(body.online).toEqual({ available: false, reason: "provider_missing" });

    await withBypassRls("test:portal-reset-payment", async (tx) => {
      await tx.update(tenants).set({ settings: {} }).where(eq(tenants.id, TENANT.id));
    });
  });

  it("kartla ödeme kapalıyken ödeme başlatılamıyor", async () => {
    // Ekranın düğmeyi gizlemesi kolaylık; kapı uçta. Doğrudan istek atan bir
    // istemci, yönetimin hiç açmadığı tahsilatı başlatıp siteye komisyon
    // yazdırabilirdi.
    const res = await postJson("/v1/panel/portal/payment", aliceCookie, {});
    const error = res.body.error as
      | { message?: string; details?: { reason?: string } }
      | undefined;

    expect(res.status).toBe(422);
    expect(error?.message).toBe("online_payment_unavailable");
    expect(error?.details?.reason).toBe("not_enabled");
  });

  it("oylama: malik oy kullanıyor, ikinci oy reddediliyor", async () => {
    const [poll] = await withBypassRls("test:portal-poll", async (tx) =>
      tx
        .insert(polls)
        .values({
          tenantId: TENANT.id,
          question: "Çatı yalıtımı yapılsın mı?",
          options: [
            { id: "opt1", label: "Evet" },
            { id: "opt2", label: "Hayır" },
          ],
          weightMode: "equal",
          ownersOnly: true,
          opensAt: new Date(Date.now() - 60_000),
          closesAt: new Date(Date.now() + 3_600_000),
        })
        .returning({ id: polls.id }),
    );
    const pollId = poll!.id;

    const listBefore = await get("/v1/panel/portal/polls", aliceCookie);
    const before = (listBefore.body.rows as PollView[]).find((r) => r.id === pollId);
    expect(before?.canVote).toBe(true);
    expect(before?.myVote).toEqual([]);
    // Açık oylamanın ara sonucu dönmüyor — sonradan oy verecekleri etkilerdi.
    expect(before?.result).toBeNull();

    const first = await postJson(`/v1/panel/portal/polls/${pollId}/vote`, aliceCookie, {
      optionIds: ["opt1"],
    });
    expect(first.status).toBe(201);

    // Aynı daire ikinci kez oy veremez: hem uygulama kuralı hem
    // `idx_poll_votes_unique_unit` kısıtı. Sebep hata zarfının `hint`
    // alanında — kod sözleşmede sabit kalırken ayrıntı korunuyor.
    const second = await postJson(`/v1/panel/portal/polls/${pollId}/vote`, aliceCookie, {
      optionIds: ["opt2"],
    });
    expect(second.status).toBe(400);
    expect(errorHint(second.body)).toContain("already_voted");

    const listAfter = await get("/v1/panel/portal/polls", aliceCookie);
    const after = (listAfter.body.rows as PollView[]).find((r) => r.id === pollId);
    expect(after?.myVote).toEqual(["opt1"]);
    expect(after?.blockedReason).toBe("already_voted");

    // Komşunun oyu bu sakinin listesine sızmıyor.
    const bobView = await get("/v1/panel/portal/polls", bobCookie);
    const bobPoll = (bobView.body.rows as PollView[]).find((r) => r.id === pollId);
    expect(bobPoll?.myVote).toEqual([]);
    expect(bobPoll?.canVote).toBe(true);

    // Tanınmayan seçenek reddediliyor: seçenek kimliği istemciden geliyor ve
    // sunucu onu anketin kendi seçenek listesine karşı doğruluyor.
    const bogus = await postJson(`/v1/panel/portal/polls/${pollId}/vote`, bobCookie, {
      optionIds: ["opt9"],
    });
    expect(bogus.status).toBe(400);
    expect(errorHint(bogus.body)).toContain("unknown_option");

    await withBypassRls("test:portal-poll-cleanup", async (tx) => {
      await tx.delete(pollVotes).where(eq(pollVotes.pollId, pollId));
      await tx.delete(polls).where(eq(polls.id, pollId));
    });
  });

  it("sakin yönetim mesaj ucuna erişemiyor", async () => {

    // §5.8.1'de kapatılan açık: `message:read` sakinde yok, bu uç site
    // genelindeki tüm yazışmaları döndürüyor.
    const { status } = await get("/v1/panel/communication/messages", aliceCookie);
    expect(status).toBe(403);
  });
});

/**
 * Telefon değişikliği — PROJE-DURUMU §5.8.
 *
 * NEDEN ENTEGRASYON TESTİ: akışın değeri tek bir dalda toplanıyor — "kodu
 * doğrulayamayan numarayı değiştiremez". Bu iddia ancak gerçek veritabanına
 * yazılmış bir doğrulama kaydı ve gerçek bir HTTP turu ile sınanabilir; birim
 * testi `consumeVerificationToken`'ı sahtelemek zorunda kalır ve tam da
 * sınamak istediğimiz şeyi sahtelemiş olurdu.
 *
 * Kod testte `issueVerificationToken` ile üretiliyor — servisin kullandığı
 * fonksiyonun aynısı. Kayıt hash saklıyor, yani gönderilen kodu okumanın başka
 * yolu yok; kurulumda bilinen bir kod yazmak tek dürüst yaklaşım.
 */
describe.skipIf(!apiReachable)("sakin portalı — telefon değişikliği", () => {
  const NEW_PHONE = `+9055509${String(Date.now()).slice(-5)}`;

  async function phoneOf(userId: string): Promise<string | null> {
    return withBypassRls("test:phone-read", async (tx) => {
      const rows = await tx
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0]?.phone ?? null;
    });
  }

  it("yanlış kod numarayı değiştirmiyor", async () => {
    const before = await phoneOf(ALICE.id);

    const { status } = await postJson(
      "/v1/panel/portal/profile/phone/verify",
      aliceCookie,
      { phone: NEW_PHONE, code: "000000" },
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await phoneOf(ALICE.id)).toBe(before);
  });

  it("başkasına verilmiş kod kabul edilmiyor", async () => {
    /*
     * Aynı numaraya iki hesap kod isteyebilir; kod doğru olsa bile sahibi
     * değilse geçmemeli. Bu kontrol olmasaydı, aynı hattı hedefleyen iki
     * hesaptan biri diğerinin kodunu kullanabilirdi.
     */
    const shared = `+9055508${String(Date.now()).slice(-5)}`;
    await issueVerificationToken({
      identifier: shared,
      purpose: "phone_change",
      code: "424242",
      metadata: { userId: BOB.id },
    });

    const { status } = await postJson(
      "/v1/panel/portal/profile/phone/verify",
      aliceCookie,
      { phone: shared, code: "424242" },
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(await phoneOf(ALICE.id)).not.toBe(shared);
  });

  it("başkasının numarası alınamıyor", async () => {
    const bobPhone = await phoneOf(BOB.id);
    expect(bobPhone).toBeTruthy();

    await issueVerificationToken({
      identifier: bobPhone!,
      purpose: "phone_change",
      code: "515151",
      metadata: { userId: ALICE.id },
    });

    const { status, body } = await postJson(
      "/v1/panel/portal/profile/phone/verify",
      aliceCookie,
      { phone: bobPhone, code: "515151" },
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toContain("phone_taken");
    // Komşunun numarası da yerinde duruyor.
    expect(await phoneOf(BOB.id)).toBe(bobPhone);
  });

  it("doğru kod numarayı değiştiriyor ve kod ikinci kez çalışmıyor", async () => {
    await issueVerificationToken({
      identifier: NEW_PHONE,
      purpose: "phone_change",
      code: "123456",
      metadata: { userId: ALICE.id },
    });

    const first = await postJson(
      "/v1/panel/portal/profile/phone/verify",
      aliceCookie,
      { phone: NEW_PHONE, code: "123456" },
    );
    expect(first.status).toBe(201);
    expect(await phoneOf(ALICE.id)).toBe(NEW_PHONE);

    // Tek kullanımlık: aynı kodla ikinci bir değişiklik yapılamaz.
    const replay = await postJson(
      "/v1/panel/portal/profile/phone/verify",
      aliceCookie,
      { phone: NEW_PHONE, code: "123456" },
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });

  it("kayıtlı numara için kod istenmiyor", async () => {
    const current = await phoneOf(ALICE.id);
    const { status } = await postJson(
      "/v1/panel/portal/profile/phone",
      aliceCookie,
      { phone: current },
    );
    expect(status).toBeGreaterThanOrEqual(400);
  });
});
