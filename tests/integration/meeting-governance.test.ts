import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDb } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Toplantı: tebliğ uyarısı (KMK md.29), hazirun ve yeter sayı (md.30),
 * vekâlet sınırı (md.31), erteleme/iptal.
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("toplanti", 4);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const hint = (body: Record<string, unknown>) =>
  (body.error as { details?: { hint?: string } } | undefined)?.details?.hint;

describe.skipIf(!apiReachable)("toplantı yönetimi", () => {
  it("tebliğ, hazirun, yeter sayı, vekâlet sınırı, erteleme ve iptal", async () => {
    const created = await site.call("POST", "/v1/panel/communication/meetings", {
      title: "Olağan genel kurul", kind: "ordinary", scheduledAt: "2026-12-20T10:00:00.000Z", agenda: ["Açılış", "Bütçe"],
    });
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    const detail = async () => (await site.call("GET", `/v1/panel/communication/meetings/${id}`)).body as Record<string, any>;

    let d = await detail();
    expect(d.noticeWarning).toBe("missing");
    expect(d.units).toHaveLength(4);
    expect(d.quorum.firstCallMet).toBe(false);

    // 10 gün önce tebliğ → geç.
    await site.call("POST", `/v1/panel/communication/meetings/${id}/notice`, { noticeSentAt: "2026-12-10T10:00:00.000Z", method: "registered_mail" });
    d = await detail();
    expect(d.noticeWarning).toBe("late");
    expect(d.noticeDays).toBe(10);
    await site.call("POST", `/v1/panel/communication/meetings/${id}/notice`, { noticeSentAt: "2026-12-01T10:00:00.000Z", method: "hand" });
    expect((await detail()).noticeWarning).toBeNull();

    // Hazirun: 2/4 daire → çoğunluk yok, ikinci toplantı (≥1/3) var.
    const a1 = await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[0] });
    expect(a1.status).toBe(201);
    // Vekâlet: 4 malikli sitede bir vekil en çok 1 daire.
    expect((await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[1], proxyName: "Ayşe Vekil" })).status).toBe(201);
    const over = await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[2], proxyName: "ayşe  vekil" });
    expect(over.status).toBe(409);
    expect(hint(over.body)).toBe("conflict:proxy_limit");
    // Aynı daire iki kez yazılamaz.
    expect(hint((await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[0] })).body)).toBe("conflict:unit_already_attending");

    d = await detail();
    expect(d.quorum.attendingUnits).toBe(2);
    expect(d.quorum.firstCallMet).toBe(false);
    expect(d.quorum.secondCallMet).toBe(true);
    expect(d.attendances[0].ownerName).toContain("Malik1");
    expect(d.attendances[1].proxyName).toBe("Ayşe Vekil");

    // Üçüncü daire bizzat → 3/4 çoğunluk.
    await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[2] });
    d = await detail();
    expect(d.quorum.firstCallMet).toBe(true);
    const list = (await site.call("GET", "/v1/panel/communication/meetings")).body.rows as { id: string; quorumMet: boolean }[];
    expect(list.find((m) => m.id === id)!.quorumMet).toBe(true);

    // Satır çıkarılınca yeniden hesaplanır.
    await site.call("DELETE", `/v1/panel/communication/meetings/${id}/attendance/${d.attendances[2].id}`);
    expect((await detail()).quorum.firstCallMet).toBe(false);

    // Erteleme: yeni tarih zorunlu, tebliğ sıfırlanır.
    expect((await site.call("POST", `/v1/panel/communication/meetings/${id}/status`, { status: "postponed", reason: "Salon bulunamadı" })).status).toBe(422);
    expect((await site.call("POST", `/v1/panel/communication/meetings/${id}/status`, { status: "postponed", reason: "Salon bulunamadı", newScheduledAt: "2027-01-10T10:00:00.000Z" })).status).toBe(201);
    d = await detail();
    expect(d.status).toBe("postponed");
    expect(d.noticeSentAt).toBeNull();
    expect(d.noticeWarning).toBe("missing");
    expect(d.statusReason).toBe("Salon bulunamadı");

    // İptal → sonrası kilitli.
    expect((await site.call("POST", `/v1/panel/communication/meetings/${id}/status`, { status: "cancelled", reason: "Yönetim kararı ile iptal" })).status).toBe(201);
    const locked = await site.call("POST", `/v1/panel/communication/meetings/${id}/attendance`, { unitId: site.unitIds[3] });
    expect(hint(locked.body)).toBe("conflict:meeting_cancelled");
    expect((await detail()).noticeWarning).toBeNull();
  });
});
