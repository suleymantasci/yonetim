import { describe, expect, it } from "vitest";

import { distribute, tlToKurus } from "@yonetim/core";
import {
  allocatePayment, calculateLateFee, distributeDues, evaluateQuorum, meetingQuorumMet,
  outstandingBalance, planDebtTransfer, simulate,
} from "@yonetim/dues";
import { currentPeriod } from "@yonetim/core";

describe("kuruş dağıtımı", () => {
  it("kuruş kaybı olmadan böler", () => {
    const parts = distribute(10_000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it("ağırlık yoksa eşit dağıtır", () => {
    const parts = distribute(1000, [0, 0]);
    expect(parts).toEqual([500, 500]);
  });
});

describe("borçlandırma formülleri (SPEC 6.1)", () => {
  const units = [
    { id: "a", landShare: 0.3, areaM2: 120, residentCount: 4 },
    { id: "b", landShare: 0.2, areaM2: 80, residentCount: 2 },
    { id: "c", landShare: 0.5, areaM2: 200, residentCount: 3 },
  ];

  it("eşit formülde birim başı sabit tutar uygular", () => {
    const r = distributeDues({ formula: "equal", baseAmountKurus: 125_000, units });
    expect(r.shares.every((s) => s.amountKurus === 125_000)).toBe(true);
    expect(r.totalKurus).toBe(375_000);
  });

  it("arsa payına göre oransal böler ve toplamı korur", () => {
    const r = distributeDues({ formula: "land_share", totalAmountKurus: 100_000, units });
    expect(r.totalKurus).toBe(100_000);
    const byId = Object.fromEntries(r.shares.map((s) => [s.unitId, s.amountKurus]));
    expect(byId.c).toBeGreaterThan(byId.a!);
    expect(byId.a).toBeGreaterThan(byId.b!);
  });

  it("veri eksikse eşit dağıtıma düşer ve uyarı verir", () => {
    const r = distributeDues({
      formula: "land_share",
      totalAmountKurus: 90_000,
      units: [{ id: "x" }, { id: "y" }, { id: "z" }],
    });
    expect(r.fellBackToEqual).toBe(true);
    expect(r.shares.every((s) => s.amountKurus === 30_000)).toBe(true);
  });

  it("karma formülde bileşenleri ağırlıklı toplar", () => {
    const r = distributeDues({
      formula: "mixed",
      totalAmountKurus: 200_000,
      mixWeights: { equal: 50, land_share: 50 },
      units,
    });
    expect(r.totalKurus).toBe(200_000);
  });

  it("muaf birim 0 alır, havuz diğerlerine yayılmaz", () => {
    const r = distributeDues({
      formula: "equal",
      baseAmountKurus: 100_000,
      units: [{ id: "a" }, { id: "b", exempt: true }],
    });
    expect(r.totalKurus).toBe(100_000);
    expect(r.shares.find((s) => s.unitId === "b")!.amountKurus).toBe(0);
  });

  it("birim çarpanını uygular (dükkan 2x)", () => {
    const r = distributeDues({
      formula: "equal",
      baseAmountKurus: 100_000,
      units: [{ id: "daire" }, { id: "dukkan", multiplier: 2 }],
    });
    expect(r.shares.find((s) => s.unitId === "dukkan")!.amountKurus).toBe(200_000);
  });
});

describe("gecikme tazminatı (KMK md.20)", () => {
  const due = new Date("2026-01-10T23:59:00+03:00");

  it("vade gelmemişse tazminat uygulanmaz", () => {
    const r = calculateLateFee({
      principalKurus: 100_000,
      dueDate: due,
      asOf: new Date("2026-01-05T12:00:00+03:00"),
    });
    expect(r.feeKurus).toBe(0);
  });

  it("aylık %5 üst sınırını aşamaz", () => {
    const r = calculateLateFee({
      principalKurus: 100_000,
      dueDate: due,
      asOf: new Date("2026-02-10T12:00:00+03:00"),
      monthlyPct: 20,
    });
    expect(r.effectiveMonthlyPct).toBe(5);
  });

  it("iki aylık gecikmede iki kat uygular", () => {
    const r = calculateLateFee({
      principalKurus: 100_000,
      dueDate: due,
      asOf: new Date("2026-03-05T12:00:00+03:00"),
    });
    expect(r.chargedMonths).toBe(2);
    expect(r.feeKurus).toBe(10_000);
  });

  it("ödemesiz gün tanınırsa geciken gün azalır", () => {
    const r = calculateLateFee({
      principalKurus: 100_000,
      dueDate: due,
      asOf: new Date("2026-01-15T12:00:00+03:00"),
      graceDays: 10,
    });
    expect(r.feeKurus).toBe(0);
  });
});

describe("ödeme mahsubu (TBK md.100 kıyasen)", () => {
  it("en eski borçtan başlar ve önce gecikme tazminatını kapatır", () => {
    const result = allocatePayment(60_000, [
      { id: "yeni", dueDate: new Date("2026-03-10"), amountKurus: 50_000, paidKurus: 0, lateFeeKurus: 0 },
      { id: "eski", dueDate: new Date("2026-01-10"), amountKurus: 50_000, paidKurus: 0, lateFeeKurus: 5_000 },
    ]);
    expect(result.allocations[0]!.debtId).toBe("eski");
    expect(result.allocations[0]!.appliedToLateFeeKurus).toBe(5_000);
    expect(result.allocations[0]!.appliedToPrincipalKurus).toBe(50_000);
    expect(result.allocations[0]!.fullyPaid).toBe(true);
    expect(result.allocations[1]!.debtId).toBe("yeni");
    expect(result.creditBalanceKurus).toBe(0);
  });

  it("borcu aşan tutar alacak bakiyesine yazılır", () => {
    const result = allocatePayment(100_000, [
      { id: "a", dueDate: new Date("2026-01-10"), amountKurus: 40_000, paidKurus: 0, lateFeeKurus: 0 },
    ]);
    expect(result.creditBalanceKurus).toBe(60_000);
  });

  it("bakiye hesabı negatife düşmez", () => {
    const b = outstandingBalance({ principalKurus: 10_000, lateFeeKurus: 500, paidKurus: 20_000 });
    expect(b.totalKurus).toBe(0);
    expect(b.remainingPrincipalKurus).toBe(0);
  });
});

describe("borç devri (KMK md.22)", () => {
  it("varsayılan olarak kalan borcu malike devreder", () => {
    const plans = planDebtTransfer({
      debts: [{ id: "d1", dueDate: new Date(), amountKurus: 50_000, paidKurus: 10_000, lateFeeKurus: 0 }],
      policy: "owner",
      leavingUserId: "kiraci",
      ownerUserId: "malik",
      nextTenantUserId: null,
    });
    expect(plans[0]!.toUserId).toBe("malik");
    expect(plans[0]!.amountKurus).toBe(40_000);
  });
});

describe("KMK yeter sayıları (SPEC 6.5)", () => {
  it("ilk toplantıda sayı ve arsa payı çoğunluğu arar", () => {
    expect(
      meetingQuorumMet({ totalOwners: 24, totalShare: 1, attendeeCount: 10, attendeeShare: 0.4 }),
    ).toBe(false);
    expect(
      meetingQuorumMet({ totalOwners: 24, totalShare: 1, attendeeCount: 13, attendeeShare: 0.55 }),
    ).toBe(true);
  });

  it("ikinci toplantıda katılanlarla yetinir", () => {
    expect(
      meetingQuorumMet({
        totalOwners: 24, totalShare: 1, attendeeCount: 5, attendeeShare: 0.2, isSecondCall: true,
      }),
    ).toBe(true);
  });

  it("yönetici seçiminde tüm maliklerin çoğunluğunu arar", () => {
    const fail = evaluateQuorum({
      rule: "absolute_majority",
      totalOwners: 24,
      totalShare: 1,
      votesForCount: 10,
      votesForShare: 0.42,
      votesAgainstCount: 3,
      votesAgainstShare: 0.13,
      attendeeCount: 13,
      attendeeShare: 0.55,
    });
    expect(fail.passed).toBe(false);

    const ok = evaluateQuorum({
      rule: "absolute_majority",
      totalOwners: 24,
      totalShare: 1,
      votesForCount: 13,
      votesForShare: 0.6,
      votesAgainstCount: 1,
      votesAgainstShare: 0.05,
      attendeeCount: 14,
      attendeeShare: 0.65,
    });
    expect(ok.passed).toBe(true);
  });

  it("yönetim planı değişikliği 4/5 çoğunluk ister", () => {
    const r = evaluateQuorum({
      rule: "four_fifths",
      totalOwners: 10,
      totalShare: 1,
      votesForCount: 8,
      votesForShare: 0.8,
      votesAgainstCount: 2,
      votesAgainstShare: 0.2,
      attendeeCount: 10,
      attendeeShare: 1,
    });
    expect(r.requiredCount).toBe(9);
    expect(r.passed).toBe(false);
  });
});

describe("bütçe simülatörü (SPEC 3.4)", () => {
  it("12 ay üretir ve artışı belirtilen aydan uygular", () => {
    const r = simulate({
      startPeriod: currentPeriod(),
      unitCount: 24,
      currentMonthlyDuesKurus: tlToKurus(30_000),
      increasePct: 20,
      increaseFromMonth: 3,
      monthlyExpenseKurus: tlToKurus(28_000),
      openingBalanceKurus: 0,
      collectionRate: 0.9,
    });
    expect(r.months).toHaveLength(12);
    expect(r.months[0]!.accruedDuesKurus).toBe(tlToKurus(30_000));
    expect(r.months[2]!.accruedDuesKurus).toBe(tlToKurus(36_000));
  });

  it("açık bütçede uyarı ve gereken artış oranı döner", () => {
    const r = simulate({
      startPeriod: currentPeriod(),
      unitCount: 20,
      currentMonthlyDuesKurus: tlToKurus(10_000),
      increasePct: 0,
      monthlyExpenseKurus: tlToKurus(20_000),
      openingBalanceKurus: 0,
      collectionRate: 0.9,
    });
    expect(r.summary.firstDeficitMonth).not.toBeNull();
    expect(r.summary.requiredIncreasePct).toBeGreaterThan(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("tek seferlik gideri aylara yayabilir", () => {
    const r = simulate({
      startPeriod: currentPeriod(),
      unitCount: 10,
      currentMonthlyDuesKurus: tlToKurus(10_000),
      increasePct: 0,
      monthlyExpenseKurus: 0,
      openingBalanceKurus: 0,
      collectionRate: 1,
      extraItems: [{ month: 2, label: "Cephe", amountKurus: tlToKurus(12_000), spreadMonths: 3 }],
    });
    expect(r.months[1]!.extraExpenseKurus).toBe(tlToKurus(4_000));
    expect(r.months[3]!.extraExpenseKurus).toBe(tlToKurus(4_000));
    expect(r.months[4]!.extraExpenseKurus).toBe(0);
  });
});
