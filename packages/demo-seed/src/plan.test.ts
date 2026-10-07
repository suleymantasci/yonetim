import { describe, expect, it } from "vitest";

import { SITE_BLUEPRINTS, blueprintsFor, unitCountOf } from "./blueprint";
import { buildSitePlan, type PlanContext, type SitePlan } from "./plan";
import { createRng } from "./rng";
import { seedFor } from "./index";

const NOW = new Date("2026-10-07T09:30:00Z");

function ctx(overrides: Partial<PlanContext> = {}): PlanContext {
  return {
    now: NOW,
    code: "t3stx9",
    tenantId: "00000000-0000-4000-8000-000000000001",
    managerUserId: "00000000-0000-4000-8000-000000000002",
    managerRole: "manager",
    companyId: null,
    planId: null,
    emailDomain: "demo.tasci.cloud",
    phoneSlot: 42,
    personCounter: { value: 0 },
    templates: new Map(),
    encrypt: (plain) => `enc(${plain.length})`,
    demoExpiresAt: new Date(NOW.getTime() + 86_400_000),
    ...overrides,
  };
}

function build(key: string, overrides: Partial<PlanContext> = {}): SitePlan {
  const bp = SITE_BLUEPRINTS.find((b) => b.key === key)!;
  return buildSitePlan(bp, ctx(overrides), createRng(seedFor(bp.key)));
}

/** Kimlik ve rastgele doğrulama kodu dışındaki içerik. */
function fingerprint(plan: SitePlan) {
  return {
    units: plan.units.map((u) => [u.number, u.landShareNumerator, u.ownershipType]),
    people: plan.users.map((u) => `${u.firstName} ${u.lastName}`),
    debts: plan.debts.map((d) => [d.description, d.amountKurus, d.paidKurus, d.status]),
    payments: plan.payments.map((p) => [p.amountKurus, p.method, (p.paidAt as Date).toISOString()]),
    requests: plan.requests.map((r) => [r.code, r.title, r.status]),
  };
}

describe("demo seed — site planı", () => {
  it("yönetici 1, yönetim firması 3 site alır; her sitede 30–50 bağımsız bölüm ve birden çok blok/kat", () => {
    expect(blueprintsFor("manager")).toHaveLength(1);
    expect(blueprintsFor("company")).toHaveLength(3);
    for (const bp of SITE_BLUEPRINTS) {
      const count = unitCountOf(bp);
      expect(count).toBeGreaterThanOrEqual(30);
      expect(count).toBeLessThanOrEqual(50);
      const plan = build(bp.key);
      expect(plan.units).toHaveLength(count);
      expect(plan.tenant.unitCount).toBe(count);
      expect(plan.tenant.isDemo).toBe(true);
      expect(plan.tenant.landingPublished).toBe(false);
    }
  });

  it("herkese aynı içerik: iki ayrı demo aynı veriyi üretir (yalnız kimlikler farklı)", () => {
    const a = build("yesilvadi", { code: "aaaaaa", phoneSlot: 1 });
    const b = build("yesilvadi", { code: "bbbbbb", phoneSlot: 2 });
    expect(fingerprint(a)).toEqual(fingerprint(b));
    expect(a.units[0]!.id).not.toBe(b.units[0]!.id);
  });

  it("her modül dolu", () => {
    const plan = build("yesilvadi");
    const required: (keyof SitePlan)[] = [
      "blocks", "units", "users", "memberships", "occupancies", "vendors", "bankAccounts",
      "openingEntries", "expenseCategories", "budgets", "staff", "duesPlans", "duesRuns", "debts",
      "payments", "allocations", "bankTransactions", "expenses", "staffLedger", "meters",
      "meterReadings", "requests", "requestComments", "maintenanceRecords", "maintenanceLogs",
      "announcements", "announcementReads", "polls", "pollVotes", "meetings", "meetingAttendances",
      "meetingDecisions", "decisionBook", "resources", "reservations", "parcels", "visitors",
      "inventory", "certificates", "accessRequests", "kvkkRequests", "notifications",
    ];
    for (const key of required) {
      expect((plan[key] as unknown[]).length, key).toBeGreaterThan(0);
    }
    // Geçmişe dönük 12 ay + içinde bulunulan ay borçlandırma.
    expect(new Set(plan.debts.filter((d) => d.kind === "dues" && d.period).map((d) => d.period)).size).toBe(13);
  });

  it("mahsup tutarlı: her ödeme dağıtımlarının toplamı, her borcun ödenen tutarı mahsupların toplamı", () => {
    for (const bp of SITE_BLUEPRINTS) {
      const plan = build(bp.key);
      const byPayment = new Map<string, number>();
      const byDebt = new Map<string, number>();
      for (const a of plan.allocations) {
        byPayment.set(a.paymentId, (byPayment.get(a.paymentId) ?? 0) + (a.amountKurus as number));
        byDebt.set(a.debtId, (byDebt.get(a.debtId) ?? 0) + (a.amountKurus as number));
      }
      for (const p of plan.payments) expect(byPayment.get(p.id!)).toBe(p.amountKurus);
      for (const d of plan.debts) {
        const paid = (d.paidKurus as number) ?? 0;
        expect(byDebt.get(d.id!) ?? 0).toBe(paid);
        const total = (d.amountKurus as number) + ((d.lateFeeKurus as number) ?? 0);
        expect(paid).toBeLessThanOrEqual(total);
        const expected = paid >= total ? "paid" : paid > 0 ? "partial" : (d.dueDate as Date) < NOW ? "overdue" : "pending";
        expect(d.status).toBe(expected);
      }
      // Gelecekte ödeme yok.
      for (const p of plan.payments) expect((p.paidAt as Date).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("kasa ve banka hiçbir an eksiye düşmez; gerçekçi bir tahsilat karışımı var", () => {
    for (const bp of SITE_BLUEPRINTS) {
      const { summary, debts } = build(bp.key);
      expect(summary.minCashBalanceKurus).toBeGreaterThanOrEqual(0);
      expect(summary.minBankBalanceKurus).toBeGreaterThan(0);
      const statuses = new Set(debts.map((d) => d.status));
      expect(statuses.has("paid")).toBe(true);
      expect(statuses.has("overdue")).toBe(true);
      expect(summary.outstandingKurus).toBeGreaterThan(0);
    }
  });

  it("demo kişileri güvenli aralıkta: +90 500 telefonları ve demo alan adı; demo içinde tekil", () => {
    const counter = { value: 0 };
    const phones: string[] = [];
    const emails: string[] = [];
    for (const bp of SITE_BLUEPRINTS) {
      const plan = build(bp.key, { personCounter: counter });
      for (const u of plan.users) {
        expect(u.isDemo).toBe(true);
        expect(u.phone).toMatch(/^\+905000042\d{3}$/);
        phones.push(u.phone!);
        if (u.email) {
          expect(u.email.endsWith("@demo.tasci.cloud")).toBe(true);
          emails.push(u.email);
        }
      }
    }
    expect(new Set(phones).size).toBe(phones.length);
    expect(new Set(emails).size).toBe(emails.length);
    expect(counter.value).toBeLessThan(1000);
  });

  it("talep kodları yıl içinde sıralı ve tekil", () => {
    const plan = build("mavikoru");
    const codes = plan.requests.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^TLP-\d{4}-\d{4}$/);
  });
});
