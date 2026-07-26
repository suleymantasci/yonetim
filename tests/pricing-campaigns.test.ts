import { describe, expect, it } from "vitest";

import { tlToKurus } from "@yonetim/core";
import {
  CAMPAIGN_TEMPLATES, applyBestCampaign, detectCampaignFraud, draftFromTemplate,
  evaluateCampaigns, templateByKey, type Campaign, type PurchaseCandidate, type TenantSnapshot,
} from "@yonetim/campaigns";
import {
  BILLING_PERIODS, STANDARD_PLANS, planForUnitCount, prorateUpgrade, quote, refundAmountKurus,
  renewalPriceKurus, savingsVsCompetitorPct, smsOverageKurus, splitVat,
} from "@yonetim/pricing";
import { dunningPlan, evaluateDunning, evaluateTrial } from "@yonetim/jobs";

describe("paket seçimi (SPEC 2.3)", () => {
  it("daire sayısına göre doğru kademeyi bulur", () => {
    expect(planForUnitCount(12).code).toBe("standart-1");
    expect(planForUnitCount(24).code).toBe("standart-2");
    expect(planForUnitCount(48).code).toBe("standart-3");
    expect(planForUnitCount(150).code).toBe("standart-5");
    expect(planForUnitCount(5_000).code).toBe("standart-15");
  });

  it("kademe altındaki küçük apartmanı ilk pakete alır", () => {
    expect(planForUnitCount(3).code).toBe("standart-1");
  });

  it("15 kademe tanımlıdır ve fiyatlar artan sıradadır", () => {
    expect(STANDARD_PLANS).toHaveLength(15);
    for (let i = 1; i < STANDARD_PLANS.length; i++) {
      expect(STANDARD_PLANS[i]!.yearlyPriceTl).toBeGreaterThan(STANDARD_PLANS[i - 1]!.yearlyPriceTl);
    }
  });

  it("rakip fiyatının yarısı politikasını korur", () => {
    for (const p of STANDARD_PLANS) {
      const savings = savingsVsCompetitorPct(p);
      expect(savings, p.code).toBeGreaterThanOrEqual(49);
      expect(savings, p.code).toBeLessThanOrEqual(51);
    }
  });
});

describe("fiyat teklifi", () => {
  it("yıllık peşinde vade farkı yoktur", () => {
    const q = quote(48, "yearly");
    expect(q.surchargeKurus).toBe(0);
    expect(q.installmentCount).toBe(1);
  });

  it("aylık ödemede vade farkı uygular", () => {
    const q = quote(48, "monthly");
    expect(q.surchargeKurus).toBeGreaterThan(0);
    expect(q.installmentCount).toBe(12);
    expect(q.yearlyTotalKurus).toBeGreaterThan(q.listYearlyKurus);
  });

  it("tüm periyotlar tanımlıdır", () => {
    expect(Object.keys(BILLING_PERIODS)).toEqual(["yearly", "semiannual", "quarterly", "monthly"]);
  });

  it("KDV ayrıştırması toplamı korur", () => {
    const { netKurus, vatKurus } = splitVat(120_000);
    expect(netKurus + vatKurus).toBe(120_000);
    expect(netKurus).toBe(100_000);
  });
});

describe("plan değişimi ve yenileme (SPEC 15.1 / 2.3)", () => {
  it("upgrade'de kalan gün oranında fark alır", () => {
    const r = prorateUpgrade({
      currentYearlyKurus: tlToKurus(6_250),
      newYearlyKurus: tlToKurus(8_250),
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2027-01-01"),
      now: new Date("2026-07-01"),
    });
    expect(r.chargeKurus).toBeGreaterThan(0);
    expect(r.chargeKurus).toBeLessThan(tlToKurus(2_000));
  });

  it("downgrade'de fark tahsil edilmez", () => {
    const r = prorateUpgrade({
      currentYearlyKurus: tlToKurus(8_250),
      newYearlyKurus: tlToKurus(6_250),
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2027-01-01"),
      now: new Date("2026-07-01"),
    });
    expect(r.chargeKurus).toBe(0);
  });

  it("yenileme artışı %30 tavanıyla sınırlanır", () => {
    const r = renewalPriceKurus(tlToKurus(10_000), tlToKurus(20_000));
    expect(r.cappedByPolicy).toBe(true);
    expect(r.priceKurus).toBe(tlToKurus(13_000));
  });

  it("tavan altındaki artışı olduğu gibi uygular", () => {
    const r = renewalPriceKurus(tlToKurus(10_000), tlToKurus(11_000));
    expect(r.cappedByPolicy).toBe(false);
    expect(r.priceKurus).toBe(tlToKurus(11_000));
  });

  it("14 gün içinde koşulsuz iade tam tutardır", () => {
    const paidAt = new Date("2026-03-01");
    expect(refundAmountKurus({ paidKurus: 100_000, paidAt, now: new Date("2026-03-10") }).refundKurus).toBe(100_000);
    expect(refundAmountKurus({ paidKurus: 100_000, paidAt, now: new Date("2026-04-01") }).refundKurus).toBe(0);
  });

  it("SMS kota aşımı adet başına 0,30 ₺ hesaplanır", () => {
    expect(smsOverageKurus(120, 90)).toBe(tlToKurus(9));
    expect(smsOverageKurus(50, 90)).toBe(0);
  });
});

describe("kampanya motoru (SPEC 16)", () => {
  const now = new Date("2026-03-01");

  const tenant: TenantSnapshot = {
    id: "t1",
    createdAt: new Date("2026-02-25"),
    unitCount: 48,
    segment: "new_signup",
    hasExistingSubscription: false,
    usedCampaignIds: [],
    signupRank: 42,
  };

  const candidate: PurchaseCandidate = {
    planCode: "standart-3",
    unitCount: 48,
    period: "yearly",
    listPriceKurus: tlToKurus(6_250),
    installmentKurus: tlToKurus(6_250),
    commitsToYears: 1,
  };

  function activate(key: string, overrides: Partial<Campaign> = {}): Campaign {
    const t = templateByKey(key)!;
    return {
      id: key,
      ...draftFromTemplate(t, { status: "active", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-12-31") }, now),
      ...overrides,
    } as Campaign;
  }

  it("11 hazır şablon tanımlıdır (Yönetimcell'in 6'sı + 5 yeni)", () => {
    expect(CAMPAIGN_TEMPLATES.length).toBeGreaterThanOrEqual(11);
    for (const key of [
      "yeni_site_hosgeldin", "uc_yil_taahhut_ilk_yil_bedava", "yonetim_firmasi_6_ay",
      "yonetim_firmasi_3_ay", "gecis_kampanyasi", "tavsiye_et_kazan", "partner_sayac_ortakligi",
    ]) {
      expect(templateByKey(key), key).toBeDefined();
    }
  });

  it("yeni kayıt için hoşgeldin kampanyasını uygun bulur", () => {
    const applicable = evaluateCampaigns([activate("yeni_site_hosgeldin")], tenant, candidate, now);
    expect(applicable).toHaveLength(1);
    expect(applicable[0]!.freeMonths).toBe(1);
  });

  it("3 yıl taahhüt yoksa ilk yıl bedava kampanyasını dışlar", () => {
    const campaign = activate("uc_yil_taahhut_ilk_yil_bedava");
    expect(evaluateCampaigns([campaign], tenant, candidate, now)).toHaveLength(0);
    const committed = { ...candidate, commitsToYears: 3 };
    expect(evaluateCampaigns([campaign], tenant, committed, now)).toHaveLength(1);
  });

  it("yönetim firması kampanyası site yöneticisine uygulanmaz", () => {
    const campaign = activate("yonetim_firmasi_6_ay");
    expect(evaluateCampaigns([campaign], tenant, candidate, now)).toHaveLength(0);
    const company: TenantSnapshot = { ...tenant, segment: "mgmt_company" };
    expect(evaluateCampaigns([campaign], company, candidate, now)).toHaveLength(1);
  });

  it("geçiş kampanyası yalnızca rakipten geçenlere açıktır", () => {
    const campaign = activate("gecis_kampanyasi");
    const migrating: TenantSnapshot = { ...tenant, segment: "migrating" };
    expect(evaluateCampaigns([campaign], migrating, candidate, now)).toHaveLength(0);
    const withContract = { ...candidate, migratingFrom: "apsiyon", remainingContractMonths: 7 };
    const result = evaluateCampaigns([campaign], migrating, withContract, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.discountKurus).toBe(candidate.listPriceKurus);
  });

  it("erken kuş kampanyası ilk 100 kayıtla sınırlıdır", () => {
    const campaign = activate("erken_kus");
    expect(evaluateCampaigns([campaign], tenant, candidate, now)).toHaveLength(1);
    const late: TenantSnapshot = { ...tenant, signupRank: 500 };
    expect(evaluateCampaigns([campaign], late, candidate, now)).toHaveLength(0);
  });

  it("kullanım limiti dolmuş kampanyayı dışlar", () => {
    const campaign = activate("yeni_site_hosgeldin", { usageLimit: 5, usageCount: 5 });
    expect(evaluateCampaigns([campaign], tenant, candidate, now)).toHaveLength(0);
  });

  it("tenant başına limit aşıldıysa dışlar", () => {
    const campaign = activate("yeni_site_hosgeldin");
    const used: TenantSnapshot = { ...tenant, usedCampaignIds: ["yeni_site_hosgeldin"] };
    expect(evaluateCampaigns([campaign], used, candidate, now)).toHaveLength(0);
  });

  it("en avantajlı kampanyayı seçer, stackable olmayanı birleştirmez", () => {
    const percent = activate("black_friday", {
      conditions: { minPeriod: "yearly" },
      stackable: false,
    });
    const welcome = activate("yeni_site_hosgeldin");
    const applicable = evaluateCampaigns([welcome, percent], tenant, candidate, now);
    const best = applyBestCampaign(candidate, applicable);
    expect(best.applied).toHaveLength(1);
    expect(best.finalPriceKurus).toBeLessThan(candidate.listPriceKurus);
    expect(best.savingsKurus).toBe(candidate.listPriceKurus - best.finalPriceKurus);
  });

  it("stackable kampanyalar birleşebilir ama fiyat negatife düşmez", () => {
    const a = activate("yillik_pesin_indirim");
    const b = activate("tavsiye_et_kazan", {
      audience: { segments: ["new_signup"] },
      conditions: {},
    });
    const applicable = evaluateCampaigns([a, b], tenant, candidate, now);
    const best = applyBestCampaign(candidate, applicable);
    expect(best.finalPriceKurus).toBeGreaterThanOrEqual(0);
  });

  it("partner kampanyası %100 indirim uygular", () => {
    const campaign = activate("partner_sayac_ortakligi");
    const withPartner = { ...candidate, partnerContracts: ["bulut_enerji"] };
    const applicable = evaluateCampaigns([campaign], tenant, withPartner, now);
    expect(applicable[0]!.finalPriceKurus).toBe(0);
    expect(applicable[0]!.lifetime).toBe(true);
  });

  it("indirim üst sınırını aşmaz", () => {
    // Tavsiye ödülü mevcut müşteriye verilir; büyük paketlerde 10.000 ₺ ile sınırlıdır.
    const campaign = activate("tavsiye_et_kazan");
    const referrer: TenantSnapshot = { ...tenant, segment: "existing_customer" };
    const expensive: PurchaseCandidate = {
      ...candidate,
      listPriceKurus: tlToKurus(44_450),
      referralCount: 3,
    };
    const applicable = evaluateCampaigns([campaign], referrer, expensive, now);
    expect(applicable).toHaveLength(1);
    expect(applicable[0]!.discountKurus).toBeLessThanOrEqual(tlToKurus(10_000));
  });

  it("süresi geçmiş kampanyayı dışlar", () => {
    const campaign = activate("yeni_site_hosgeldin", { endsAt: new Date("2026-02-01") });
    expect(evaluateCampaigns([campaign], tenant, candidate, now)).toHaveLength(0);
  });
});

describe("kampanya kötüye kullanım kontrolü (SPEC 16.7)", () => {
  it("kendi kendini tavsiyeyi engeller", () => {
    const signals = detectCampaignFraud({
      sameTcknTenantCount: 1,
      sameIbanTenantCount: 1,
      samePhoneTenantCount: 1,
      sameIpSignups24h: 1,
      referralSelfMatch: true,
    });
    expect(signals.some((s) => s.code === "self_referral" && s.severity === "block")).toBe(true);
  });

  it("çoklu kayıtta inceleme işaretler ama engellemez (yönetim firması olabilir)", () => {
    const signals = detectCampaignFraud({
      sameTcknTenantCount: 8,
      sameIbanTenantCount: 1,
      samePhoneTenantCount: 1,
      sameIpSignups24h: 1,
      referralSelfMatch: false,
    });
    expect(signals[0]!.severity).toBe("review");
  });
});

describe("dunning ve trial akışı (SPEC 15.3 / 2.3)", () => {
  it("5 adımlı dunning planı tanımlıdır", () => {
    const plan = dunningPlan();
    expect(plan.map((p) => p.day)).toEqual([1, 3, 7, 14, 30]);
    expect(plan[3]!.action).toBe("suspend_read_only");
    expect(plan[4]!.action).toBe("archive");
  });

  it("14. günde askıya alma kararı verir", () => {
    const d = evaluateDunning({
      firstFailureAt: new Date("2026-03-01"),
      lastStepIndex: 3,
      now: new Date("2026-03-15"),
    });
    expect(d.shouldSuspend).toBe(true);
  });

  it("30. günde arşivleme kararı verir", () => {
    const d = evaluateDunning({
      firstFailureAt: new Date("2026-03-01"),
      lastStepIndex: 4,
      now: new Date("2026-04-05"),
    });
    expect(d.shouldArchive).toBe(true);
  });

  it("deneme bitince askı, 6 ay sonra arşiv", () => {
    const trialEnd = new Date("2026-03-01");
    const justAfter = evaluateTrial({ trialEndsAt: trialEnd, now: new Date("2026-03-05") });
    expect(justAfter.expired).toBe(true);
    expect(justAfter.shouldArchive).toBe(false);

    const muchLater = evaluateTrial({ trialEndsAt: trialEnd, now: new Date("2026-10-01") });
    expect(muchLater.shouldArchive).toBe(true);
  });

  it("deneme sürerken bilgilendirme anahtarı verir", () => {
    const r = evaluateTrial({ trialEndsAt: new Date("2026-04-01"), now: new Date("2026-03-20") });
    expect(r.expired).toBe(false);
    expect(r.messageKey).toBe("upcoming");
    expect(r.daysOver).toBeLessThan(0);
  });
});
