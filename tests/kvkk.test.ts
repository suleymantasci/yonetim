import { describe, expect, it } from "vitest";

import { dueDateFor, filterContent, kvkkRiskScore, planErasure, privacyNotice, requiresIndividualDelivery } from "@yonetim/kvkk";

describe("KVKK içerik filtresi (SPEC 1.2 / 6.4)", () => {
  it("daire numarası ile borç ifadesini engeller", () => {
    const r = filterContent("3 nolu daire 4 aydır borçlu, lütfen ödeyin.");
    expect(r.blocked).toBe(true);
    expect(r.findings.some((f) => f.code === "unit_debt_disclosure")).toBe(true);
    expect(requiresIndividualDelivery(r)).toBe(true);
  });

  it("kişi adı ile borç ifadesini engeller", () => {
    const r = filterContent("Ahmet Yılmaz aidat ödemeyen sakinlerden biridir.");
    expect(r.blocked).toBe(true);
  });

  it("TCKN'yi engeller ve maskeler", () => {
    const r = filterContent("Kimlik no 10000000146 olan sakin.");
    expect(r.blocked).toBe(true);
    expect(r.redacted).not.toContain("10000000146");
  });

  it("sağlık verisini engeller (md.6 özel nitelikli)", () => {
    const r = filterContent("5. kattaki komşumuz tedavi görüyor, gürültü yapmayalım.");
    expect(r.blocked).toBe(true);
  });

  it("masum duyuruyu geçirir", () => {
    const r = filterContent(
      "Yarın 09:00-14:00 arası şebeke bakımı nedeniyle su verilmeyecektir. Bilginize.",
    );
    expect(r.blocked).toBe(false);
    expect(r.findings).toHaveLength(0);
  });

  it("telefon numarası paylaşımında uyarı verir ama engellemez", () => {
    const r = filterContent("Acil durumda 0532 000 00 00 numarasını arayabilirsiniz.");
    expect(r.blocked).toBe(false);
    expect(r.findings.some((f) => f.severity === "warn")).toBe(true);
  });
});

describe("KVKK risk skoru (SPEC 3.3)", () => {
  const clean = {
    hasPrivacyNotice: true,
    consentCoverage: 1,
    overdueRequests: 0,
    blockedAnnouncements90d: 0,
    staleResidents: 0,
    verbisRegistered: true,
    hasDpoContact: true,
    breaches12m: 0,
    mfaEnabled: true,
    identityDocsStored: 0,
  };

  it("uyumlu yönetimde düşük risk döner", () => {
    const r = kvkkRiskScore(clean);
    expect(r.score).toBe(0);
    expect(r.level).toBe("dusuk");
    expect(r.issues).toHaveLength(0);
  });

  it("süresi geçen talep en yüksek ağırlığı alır", () => {
    const r = kvkkRiskScore({ ...clean, overdueRequests: 2 });
    expect(r.issues[0]!.code).toBe("overdue_requests");
    expect(r.score).toBeGreaterThanOrEqual(25);
  });

  it("aydınlatma metni yoksa risk artar", () => {
    const r = kvkkRiskScore({ ...clean, hasPrivacyNotice: false });
    expect(r.issues.some((i) => i.code === "no_privacy_notice")).toBe(true);
  });

  it("skor 100'ü aşmaz", () => {
    const r = kvkkRiskScore({
      hasPrivacyNotice: false,
      consentCoverage: 0,
      overdueRequests: 10,
      blockedAnnouncements90d: 5,
      staleResidents: 30,
      verbisRegistered: false,
      hasDpoContact: false,
      breaches12m: 3,
      mfaEnabled: false,
      identityDocsStored: 10,
    });
    expect(r.score).toBe(100);
    expect(r.level).toBe("kritik");
  });
});

describe("KVKK talep süreleri (SPEC 14.1)", () => {
  it("silme talebi daha kısa sürede işlenir", () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const erasure = dueDateFor("erasure", now);
    const access = dueDateFor("access", now);
    expect(erasure.getTime()).toBeLessThan(access.getTime());
  });

  it("silme planı mali kayıtları saklar", () => {
    const plan = planErasure(new Date("2026-01-01"));
    expect(plan.retained.some((r) => r.table.includes("debts"))).toBe(true);
    expect(plan.deletable.length).toBeGreaterThan(0);
    expect(plan.anonymizable.length).toBeGreaterThan(0);
  });
});

describe("aydınlatma metni", () => {
  it("site adını ve yasal dayanakları içerir", () => {
    const text = privacyNotice({ tenantName: "Örnek Apartmanı" });
    expect(text).toContain("Örnek Apartmanı");
    expect(text).toContain("Kat Mülkiyeti");
    expect(text).toContain("md.11");
  });
});
