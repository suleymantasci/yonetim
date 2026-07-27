import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DOMAIN_EVENTS,
  NOTIFICATION_POLICY,
  route,
  ruleFor,
  type DomainEventName,
} from "@yonetim/notifications";

/**
 * B2 ÇIKIŞ ÖLÇÜTÜ — GAP 4.6.5: "hangi olay hangi bildirimi doğurur" sorusunun
 * **tek** cevabı var (MIMARI-PLAN §10).
 *
 * Bu testin koruduğu şey haritanın içeriği değil, haritanın **tekliği**:
 * bir servis kendi başına bildirim göndermeye başlarsa cevap ikiye bölünür ve
 * o andan sonra soruyu kod okumadan cevaplamak mümkün olmaz.
 */
describe("bildirim politikası", () => {
  it("politikadaki her olay tanımlı bir domain olayı", () => {
    for (const name of Object.keys(NOTIFICATION_POLICY)) {
      expect(DOMAIN_EVENTS).toContain(name as DomainEventName);
    }
  });

  it("tanımsız olay bildirim doğurmuyor", () => {
    expect(ruleFor("unit.created")).toBeNull();
    expect(ruleFor("uydurma.olay")).toBeNull();
  });

  it("her kural uygulama içi kaydı garanti ediyor", () => {
    // Dış kanal başarısız olsa bile panelde iz kalmalı: bir borcun doğduğunu
    // kimseye söylememek iletişim tercihi değil şeffaflık sorunu (SPEC 1.2).
    for (const [name, rule] of Object.entries(NOTIFICATION_POLICY)) {
      expect(rule?.alwaysInApp, name).toBe(true);
    }
  });

  it("SLA ihlali yöneticiye gidiyor, sakine değil", () => {
    // Süreyi aşan taraf yönetim. Sakine "talebiniz gecikti" demek, çözmeden
    // özür dilemek olurdu.
    expect(NOTIFICATION_POLICY["request.sla_breached"]?.audience).toBe("managers");
  });

  it("tahsilat makbuzu daireye gidiyor, tahsilatı kaydedene değil", () => {
    expect(NOTIFICATION_POLICY["payment.received"]?.audience).toBe("unit_residents");
  });

  it("her kaynak türü bildirim merkezinde bir adrese karşılık geliyor", () => {
    // `notificationHref` bilinmeyen türde `null` döner ve bildirim
    // tıklanamaz hale gelir — kullanıcı için sessiz bir kırıklık.
    const shellData = readFileSync(
      join(process.cwd(), "apps/app/src/lib/shell-data.ts"),
      "utf8",
    );
    for (const [name, rule] of Object.entries(NOTIFICATION_POLICY)) {
      expect(shellData, `${name} → ${rule?.resourceType}`).toContain(
        `case "${rule?.resourceType}":`,
      );
    }
  });
});

/**
 * Yönlendirme kararı politikadan **ayrı**: politika olaya bakar, yönlendirme
 * kişiye. Aynı yerde tutulsalardı "bu kullanıcıya WhatsApp yok" bilgisi
 * bildirimin hiç doğmamasına yol açabilirdi.
 */
describe("politika ↔ yönlendirme ayrımı", () => {
  const recipient = {
    userId: "u1",
    phone: "+905551112233",
    email: "a@b.com",
    whatsappOptIn: false,
    marketingOptIn: false,
    hasAppSession: true,
  };

  it("WhatsApp izni yoksa bildirim yine üretiliyor, kanal değişiyor", () => {
    const decision = route({
      kind: "dues_reminder",
      recipient,
      now: new Date("2026-07-27T12:00:00+03:00"),
    });
    expect(decision.channels).not.toContain("whatsapp");
    expect(decision.channels.length).toBeGreaterThan(0);
  });

  it("sessiz saatte acil olmayan bildirim erteleniyor, düşürülmüyor", () => {
    const at = new Date("2026-07-27T02:00:00+03:00");
    const decision = route({ kind: "dues_reminder", recipient, now: at });
    expect(decision.scheduledFor.getTime()).toBeGreaterThan(at.getTime());
    expect(decision.channels.length).toBeGreaterThan(0);
  });
});
