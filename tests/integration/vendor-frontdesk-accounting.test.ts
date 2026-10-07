import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { closeDb, notifications, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Tedarikçi cari, kargo/ziyaretçi defteri ve sentetik mizan + BA/BS.
 */
let site: TestSite;

beforeAll(async () => {
  if (apiReachable) site = await createSite("cari", 2);
});
afterAll(async () => {
  if (apiReachable) await site.cleanup();
  await closeDb();
});

const hint = (body: Record<string, unknown>) =>
  (body.error as { details?: { hint?: string } } | undefined)?.details?.hint;

describe.skipIf(!apiReachable)("tedarikçi cari", () => {
  it("giderlerden ekstre ve bakiye; ada göre bağlama; geçersiz VKN reddi", async () => {
    expect((await site.call("POST", "/v1/panel/vendors", { name: "Asansör A.Ş.", category: "asansör", taxNumber: "12345" })).status).toBe(422);
    const v = await site.call("POST", "/v1/panel/vendors", { name: "Asansör A.Ş.", category: "asansör", taxNumber: "1234567890", iban: "TR33 0006 1005 1978 6457 8413 26" });
    expect(v.status).toBe(201);
    const vendorId = String(v.body.id);

    const expense = (body: Record<string, unknown>) =>
      site.call("POST", "/v1/panel/expenses", { description: "Asansör bakımı", vatRate: 0.2, expenseDate: "2026-09-10T00:00:00.000Z", status: "approved", ...body });
    expect((await expense({ vendorId, amountMinor: 600_000, isPaid: true, invoiceNo: "F-1" })).status).toBe(201);
    expect((await expense({ vendorId, amountMinor: 120_000, expenseDate: "2026-09-20T00:00:00.000Z" })).status).toBe(201);
    // Yalnız adla girilmiş gider (büyük/küçük harf + boşluk farkı).
    expect((await expense({ vendorName: "asansör  a.ş.", amountMinor: 50_000 })).status).toBe(201);

    let list = await site.call("GET", "/v1/panel/vendors");
    expect((list.body.totals as { unlinkedExpenses: number }).unlinkedExpenses).toBe(1);
    const link = await site.call("POST", `/v1/panel/vendors/${vendorId}/link-expenses`, {});
    expect(link.body.linked).toBe(1);

    const detail = await site.call("GET", `/v1/panel/vendors/${vendorId}`);
    const vendor = detail.body.vendor as { totalMinor: number; paidMinor: number; balanceMinor: number; iban: string };
    expect(vendor.iban).toBe("TR330006100519786457841326");
    expect(vendor.totalMinor).toBe(770_000);
    expect(vendor.paidMinor).toBe(600_000);
    expect(vendor.balanceMinor).toBe(170_000);
    const ledger = detail.body.ledger as { kind: string; balanceMinor: number }[];
    expect(ledger).toHaveLength(4);
    expect(ledger.at(-1)!.balanceMinor).toBe(170_000);

    list = await site.call("GET", "/v1/panel/vendors");
    expect((list.body.totals as { balanceMinor: number }).balanceMinor).toBe(170_000);
  });
});

describe.skipIf(!apiReachable)("kargo ve ziyaretçi", () => {
  it("kargo sakinlere bildirim düşer, teslim tek sefer; ziyaretçi çıkışı", async () => {
    const parcel = await site.call("POST", "/v1/panel/frontdesk/parcels", { unitId: site.unitIds[0], recipientName: "Malik1 cari", carrier: "Yurtiçi" });
    expect(parcel.status).toBe(201);
    expect(parcel.body.notified).toBe(2); // malik + kiracı
    const rows = await withBypassRls("test:cari-notif", (tx) =>
      tx.select().from(notifications).where(and(eq(notifications.resourceType, "parcel"), eq(notifications.resourceId, String(parcel.body.id)))),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.subject).toBe("Kargonuz geldi");

    expect((await site.call("POST", `/v1/panel/frontdesk/parcels/${parcel.body.id}/deliver`, { deliveredTo: "Malik1" })).status).toBe(201);
    const again = await site.call("POST", `/v1/panel/frontdesk/parcels/${parcel.body.id}/deliver`, { deliveredTo: "Malik1" });
    expect(hint(again.body)).toBe("conflict:parcel_already_delivered");

    const visitor = await site.call("POST", "/v1/panel/frontdesk/visitors", { visitorName: "Tesisatçı Ali", plate: "34 abc 12", unitId: site.unitIds[1] });
    expect(visitor.status).toBe(201);
    let overview = await site.call("GET", "/v1/panel/frontdesk");
    expect((overview.body.totals as { visitorsInside: number; waitingParcels: number })).toMatchObject({ visitorsInside: 1, waitingParcels: 0 });
    expect((overview.body.visitors as { plate: string }[])[0]!.plate).toBe("34 ABC 12");
    expect((await site.call("POST", `/v1/panel/frontdesk/visitors/${visitor.body.id}/checkout`, {})).status).toBe(201);
    overview = await site.call("GET", "/v1/panel/frontdesk");
    expect((overview.body.totals as { visitorsInside: number }).visitorsInside).toBe(0);

    // Sakin defteri göremez.
    expect((await site.call("GET", "/v1/panel/frontdesk", undefined, site.ownerCookie)).status).toBe(403);
  });
});

describe.skipIf(!apiReachable)("muhasebe raporları", () => {
  it("mizan borç = alacak; BA eşiği geçen tedarikçiyi listeler", async () => {
    // Bu ayın tahakkuku ve tahsilatı.
    const debt = await site.call("POST", "/v1/panel/debts", {
      unitId: site.unitIds[1], kind: "dues", description: "Ekim aidatı", amountMinor: 200_000, dueDate: "2026-10-15T00:00:00.000Z", shareTarget: "owner",
    });
    expect(debt.status).toBe(201);
    expect((await site.call("POST", "/v1/panel/debts/collect", { unitId: site.unitIds[1], amountMinor: 150_000, method: "cash", paidAt: new Date().toISOString() })).status).toBe(201);

    // İstanbul günü: raporlar gün sınırını İstanbul saatine göre çiziyor; UTC
    // günü 21:00–24:00 arasında bir gün geride kalıp bugünkü kaydı dışlıyordu.
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const mizan = await site.call("GET", `/v1/panel/reports/accounting/mizan?from=2026-01-01&to=${today}`);
    expect(mizan.status).toBe(200);
    const totals = mizan.body.totals as { debitMinor: number; creditMinor: number };
    expect(totals.debitMinor).toBe(totals.creditMinor);
    const rows = mizan.body.rows as { code: string; debitMinor: number; creditMinor: number }[];
    const byCode = (code: string) => rows.find((r) => r.code === code)!;
    expect(byCode("770").debitMinor).toBe(770_000);
    expect(byCode("320").creditMinor).toBe(770_000);
    expect(byCode("320").debitMinor).toBe(600_000);
    expect(byCode("600").creditMinor).toBe(200_000);
    expect(byCode("100").debitMinor).toBe(150_000);

    const baBs = await site.call("GET", "/v1/panel/reports/accounting/ba-bs?period=2026-09");
    const ba = baBs.body.ba as { name: string; taxNumber: string; netMinor: number; documentCount: number }[];
    expect(ba).toHaveLength(1);
    expect(ba[0]).toMatchObject({ name: "Asansör A.Ş.", taxNumber: "1234567890", documentCount: 3 });
    // KDV hariç: 770.000 / 1,2 ≈ 641.667
    expect(ba[0]!.netMinor).toBeGreaterThan(600_000);
    expect((await site.call("GET", "/v1/panel/reports/accounting/ba-bs?period=2026-13")).status).toBe(422);
  });
});
