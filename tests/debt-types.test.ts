import { describe, expect, it } from "vitest";

import { DEFAULT_DEBT_TYPES, debtorRuleFor } from "@yonetim/db";
import { calculateLateFee, lateFeePolicyFor } from "@yonetim/dues";

const base = {
  debtExempt: false,
  unitExempt: false,
  type: null,
  plan: null,
  siteMonthlyPct: 5,
};

describe("borç türü — borçlu kuralı", () => {
  it("oturan türü kiracıya, malik türü maliğe", () => {
    expect(debtorRuleFor({ debtor: "occupant", baseKind: "dues" }, { ownerPaysDues: false })).toBe("occupant");
    expect(debtorRuleFor({ debtor: "owner", baseKind: "extra" }, { ownerPaysDues: false })).toBe("owner");
  });

  it("daire istisnası yalnız aidat sınıfını maliğe çevirir", () => {
    expect(debtorRuleFor({ debtor: "occupant", baseKind: "dues" }, { ownerPaysDues: true })).toBe("owner");
    expect(debtorRuleFor({ debtor: "occupant", baseKind: "utility" }, { ownerPaysDues: true })).toBe("occupant");
  });

  it("varsayılanlar: demirbaş malikte, aidat ve yakıt oturanda, adlar tekil", () => {
    const by = Object.fromEntries(DEFAULT_DEBT_TYPES.map((t) => [t.name, t]));
    expect(by["Demirbaş"]?.debtor).toBe("owner");
    expect(by["Aidat"]?.debtor).toBe("occupant");
    expect(by["Yakıt"]?.debtor).toBe("occupant");
    expect(new Set(DEFAULT_DEBT_TYPES.map((t) => t.name)).size).toBe(DEFAULT_DEBT_TYPES.length);
  });
});

describe("gecikme kuralı", () => {
  it("muafiyetler ve 'gecikme yok' türü tazminatı keser", () => {
    expect(lateFeePolicyFor({ ...base, debtExempt: true })).toEqual({ apply: false, reason: "debt_exempt" });
    expect(lateFeePolicyFor({ ...base, unitExempt: true })).toEqual({ apply: false, reason: "unit_exempt" });
    expect(lateFeePolicyFor({ ...base, type: { lateFeeMode: "none", lateFeeMonthlyPct: 3 } })).toEqual({
      apply: false,
      reason: "type_none",
    });
  });

  it("oran önceliği: tür > plan > site", () => {
    const plan = { lateFeeMonthlyPct: 4, lateFeeDailyMode: false };
    expect(lateFeePolicyFor({ ...base, plan, type: { lateFeeMode: "monthly", lateFeeMonthlyPct: 2 } })).toMatchObject({ monthlyPct: 2 });
    expect(lateFeePolicyFor({ ...base, plan, type: { lateFeeMode: "monthly", lateFeeMonthlyPct: null } })).toMatchObject({ monthlyPct: 4 });
    expect(lateFeePolicyFor({ ...base, siteMonthlyPct: 3 })).toMatchObject({ monthlyPct: 3, prorateDaily: false });
  });

  it("günlük tür kıst hesaplar; türsüz borçta planın günlük modu geçerli", () => {
    expect(lateFeePolicyFor({ ...base, type: { lateFeeMode: "daily", lateFeeMonthlyPct: null } })).toMatchObject({ prorateDaily: true });
    expect(
      lateFeePolicyFor({ ...base, plan: { lateFeeMonthlyPct: 5, lateFeeDailyMode: true } }),
    ).toMatchObject({ prorateDaily: true });
    expect(
      lateFeePolicyFor({
        ...base,
        plan: { lateFeeMonthlyPct: 5, lateFeeDailyMode: true },
        type: { lateFeeMode: "monthly", lateFeeMonthlyPct: null },
      }),
    ).toMatchObject({ prorateDaily: false });
  });

  it("günlük mod 15 günde yarım ay, dönemsel tam ay tazminat", () => {
    const dueDate = new Date("2026-01-10T00:00:00Z");
    const asOf = new Date("2026-01-25T00:00:00Z");
    const daily = calculateLateFee({ principalKurus: 100_000, dueDate, asOf, monthlyPct: 5, prorateDaily: true });
    const monthly = calculateLateFee({ principalKurus: 100_000, dueDate, asOf, monthlyPct: 5 });
    expect(daily.feeKurus).toBe(2_500);
    expect(monthly.feeKurus).toBe(5_000);
  });
});
