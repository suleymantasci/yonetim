import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, unitOccupancies, withBypassRls } from "@yonetim/db";

import { apiReachable, BASE, createSite, type TestSite } from "./_site";

/**
 * Eksik CRUD işlemleri: daire ilişkisi düzeltme, borcu yoktur belgesi iptali,
 * sakinin kendi rezervasyonunu iptali (ve başkası adına açamaması).
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("crud", 2);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const hint = (body: Record<string, unknown>) =>
  (body.error as { details?: { hint?: string } } | undefined)?.details?.hint;

describe.skipIf(!apiReachable)("daire ilişkisi düzeltme", () => {
  it("hisse ve başlangıç düzeltilir; malik hissesi %100'ü geçemez; gerekçe zorunlu", async () => {
    const [occ] = await withBypassRls("test:crud-occ", (tx) =>
      tx.select().from(unitOccupancies).where(and(eq(unitOccupancies.unitId, site.unitIds[1]!), eq(unitOccupancies.relation, "owner"))),
    );
    const path = `/v1/panel/residents/occupancy/${occ!.id}`;
    const body = { ownershipPct: 50, startDate: "2023-05-01T00:00:00.000Z", debtTransferPolicy: "keep" };
    expect((await site.call("PATCH", path, { ...body, reason: "kısa" })).status).toBe(422);
    expect((await site.call("PATCH", path, { ...body, reason: "Tapu kaydına göre hisse yüzde elli" })).status).toBe(200);

    const [after] = await withBypassRls("test:crud-occ2", (tx) => tx.select().from(unitOccupancies).where(eq(unitOccupancies.id, occ!.id)));
    expect(Number(after!.ownershipPct)).toBe(50);
    expect(after!.debtTransferPolicy).toBe("keep");
    expect(after!.startDate.toISOString().slice(0, 10)).toBe("2023-05-01");

    // İkinci malik %60 ile eklenince toplam 110 olur → düzeltmede de reddedilir.
    await withBypassRls("test:crud-occ3", (tx) =>
      tx.insert(unitOccupancies).values({ tenantId: site.tenantId, unitId: site.unitIds[1]!, userId: site.ownerIds[0]!, relation: "owner", ownershipPct: "50", startDate: new Date("2024-01-01") }),
    );
    const over = await site.call("PATCH", path, { ...body, ownershipPct: 60, reason: "Hisse oranı yeniden düzeltme" });
    expect(over.status).toBe(409);
    expect(hint(over.body)).toBe("conflict:ownership_over_100");
  });
});

describe.skipIf(!apiReachable)("borcu yoktur belgesi iptali", () => {
  it("iptal edilir, doğrulama iptali gösterir, ikinci iptal 409", async () => {
    const issued = await site.call("POST", "/v1/panel/certificates", { unitNumber: "2" });
    expect(issued.status).toBe(201);
    const list = (await site.call("GET", "/v1/panel/certificates")).body.rows as { id: string; serialNo: string; verificationCode: string; voidedAt: string | null }[];
    const cert = list[0]!;
    expect(cert.voidedAt).toBeNull();

    expect((await site.call("POST", `/v1/panel/certificates/${cert.id}/void`, { reason: "Yanlış daire için düzenlendi" })).status).toBe(201);
    const again = await site.call("POST", `/v1/panel/certificates/${cert.id}/void`, { reason: "Yanlış daire için düzenlendi" });
    expect(again.status).toBe(409);
    expect(hint(again.body)).toBe("conflict:certificate_already_void");

    const res = await fetch(`${BASE}/v1/public/certificates/verify?serialNo=${encodeURIComponent(cert.serialNo)}&code=${cert.verificationCode}`);
    const verify = (await res.json()) as { valid: boolean; voidedAt?: string; voidReason?: string };
    expect(verify.valid).toBe(true);
    expect(verify.voidedAt).toBeTruthy();
    expect(verify.voidReason).toBe("Yanlış daire için düzenlendi");

    // Sakin belge iptal edemez.
    expect((await site.call("POST", `/v1/panel/certificates/${cert.id}/void`, { reason: "Sakin denemesi yapılıyor" }, site.ownerCookie)).status).toBe(403);
  });
});

describe.skipIf(!apiReachable)("sakin rezervasyonu", () => {
  it("kendi adına açar ve iptal eder; başkası adına açamaz, başkasınınkini iptal edemez", async () => {
    const res = await site.call("POST", "/v1/panel/operations/reservations/resources", {
      name: "Toplantı salonu", kind: "salon", requiresApproval: false, openHour: 0, closeHour: 24, maxHoursPerBooking: 4,
    });
    expect(res.status).toBe(201);
    const resourceId = String(res.body.id);
    const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const slot = (h: number) => ({ startAt: `${day}T${String(h).padStart(2, "0")}:00:00.000Z`, endAt: `${day}T${String(h + 1).padStart(2, "0")}:00:00.000Z` });

    // Başkası adına açamaz.
    const forged = await site.call("POST", "/v1/panel/operations/reservations", { resourceId, userId: site.ownerIds[1], ...slot(10) }, site.ownerCookie);
    expect(forged.status).toBe(403);

    const own = await site.call("POST", "/v1/panel/operations/reservations", { resourceId, userId: site.ownerIds[0], unitId: site.unitIds[0], ...slot(10) }, site.ownerCookie);
    expect(own.status).toBe(201);
    const other = await site.call("POST", "/v1/panel/operations/reservations", { resourceId, userId: site.ownerIds[1], ...slot(12) });
    expect(other.status).toBe(201);

    // Liste: kendi kaydı işaretli; başkasının notu gizli.
    const rows = (await site.call("GET", "/v1/panel/operations/reservations", undefined, site.ownerCookie)).body.rows as { id: string; isMine: boolean }[];
    expect(rows.find((r) => r.id === own.body.id)!.isMine).toBe(true);
    expect(rows.find((r) => r.id === other.body.id)!.isMine).toBe(false);

    // Başkasınınki 404.
    expect((await site.call("POST", `/v1/panel/operations/reservations/${other.body.id}/cancel`, { reason: "deneme" }, site.ownerCookie)).status).toBe(404);
    // Kendi kaydı iptal; ikinci iptal 409.
    expect((await site.call("POST", `/v1/panel/operations/reservations/${own.body.id}/cancel`, { reason: "Planım değişti" }, site.ownerCookie)).status).toBe(201);
    const again = await site.call("POST", `/v1/panel/operations/reservations/${own.body.id}/cancel`, { reason: "Planım değişti" }, site.ownerCookie);
    expect(again.status).toBe(409);
    expect(hint(again.body)).toBe("conflict:reservation_not_cancellable");
  });
});
