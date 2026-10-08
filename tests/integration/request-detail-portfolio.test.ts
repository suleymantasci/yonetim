import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, notifications, withBypassRls } from "@yonetim/db";

import { apiReachable, createSite, type TestSite } from "./_site";

/**
 * Talep detayı tek formdan kaydediliyor: kayıt alanları atama alanı
 * gönderilmeden PATCH'leniyor — görevli korunmalı. Portföy satırı sitenin
 * okunmamış bildirimlerini sayıyor (yalnız oturumdaki kullanıcınınkileri).
 */
let site: TestSite;

beforeAll(async () => {
  if (!apiReachable) return;
  site = await createSite("talep-portfoy", 1);
});

afterAll(async () => {
  if (apiReachable) {
    await withBypassRls("test:rdp-cleanup", (tx) =>
      tx.delete(notifications).where(eq(notifications.tenantId, site.tenantId)),
    );
    await site.cleanup();
  }
  await closeDb();
});

describe.skipIf(!apiReachable)("talep detayı + portföy bildirimleri", () => {
  it("atama alanı gönderilmeyen güncelleme görevliyi silmez", async () => {
    const created = await site.call("POST", "/v1/panel/operations/requests", {
      category: "asansor", title: "Kat butonu", priority: "normal", costMinor: 0,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const assigned = await site.call("PATCH", `/v1/panel/operations/requests/${id}/assignment`, {
      assignedToUserId: site.managerId,
    });
    expect(assigned.status).toBe(200);

    const updated = await site.call("PATCH", `/v1/panel/operations/requests/${id}`, {
      category: "asansor", title: "Kat butonu (B)", priority: "high", costMinor: 0,
    });
    expect(updated.status).toBe(200);

    const detail = await site.call("GET", `/v1/panel/operations/requests/${id}`);
    expect(detail.body.title).toBe("Kat butonu (B)");
    expect(detail.body.assignedToUserId).toBe(site.managerId);
    expect(detail.body.status).toBe("assigned");

    // Açıkça `null` gönderilirse kaldırılır (eski sözleşme korunuyor).
    await site.call("PATCH", `/v1/panel/operations/requests/${id}`, {
      category: "asansor", title: "Kat butonu (B)", priority: "high", costMinor: 0,
      assignedToUserId: null,
    });
    const cleared = await site.call("GET", `/v1/panel/operations/requests/${id}`);
    expect(cleared.body.assignedToUserId).toBeNull();
  });

  it("portföy satırı okunmamış bildirim sayısını ve son başlığı verir", async () => {
    const at = (min: number) => new Date(Date.now() - min * 60_000);
    await withBypassRls("test:rdp-notif", (tx) =>
      tx.insert(notifications).values([
        { tenantId: site.tenantId, userId: site.managerId, channel: "in_app", template: "t", recipient: "x", subject: "Eski", createdAt: at(30) },
        { tenantId: site.tenantId, userId: site.managerId, channel: "in_app", template: "t", recipient: "x", subject: "Yeni", createdAt: at(1) },
        { tenantId: site.tenantId, userId: site.managerId, channel: "in_app", template: "t", recipient: "x", subject: "Okundu", createdAt: at(0), readAt: new Date() },
        // Başka kanal ve başka kullanıcı sayılmaz.
        { tenantId: site.tenantId, userId: site.managerId, channel: "email", template: "t", recipient: "x", subject: "Mail", createdAt: at(0) },
        { tenantId: site.tenantId, userId: site.ownerIds[0], channel: "in_app", template: "t", recipient: "x", subject: "Malik", createdAt: at(0) },
      ]),
    );

    const res = await site.call("GET", "/v1/panel/portfolio");
    expect(res.status).toBe(200);
    const rows = res.body.rows as { tenantId: string; unreadNotificationCount: number; latestNotificationTitle: string | null }[];
    const row = rows.find((r) => r.tenantId === site.tenantId)!;
    expect(row.unreadNotificationCount).toBe(2);
    expect(row.latestNotificationTitle).toBe("Yeni");
    expect((res.body.totals as { unreadNotificationCount: number }).unreadNotificationCount).toBeGreaterThanOrEqual(2);
  });
});
