import { randomBytes, randomUUID } from "node:crypto";

import { maskIban } from "@yonetim/core";
import type {
  accessRequests,
  announcementReads,
  announcements,
  bankAccounts,
  bankTransactions,
  blocks,
  budgets,
  cashMovements,
  operatingBudgetLines,
  operatingBudgets,
  debtCertificates,
  debts,
  decisionBookEntries,
  duesPlans,
  duesRuns,
  expenseCategories,
  expenses,
  inventoryItems,
  kvkkRequests,
  lawyers,
  legalCaseEvents,
  legalCases,
  maintenanceLogs,
  maintenanceRecords,
  meetingAttendances,
  meetingDecisions,
  meetings,
  memberships,
  meterReadings,
  meters,
  notifications,
  openingEntries,
  parcels,
  paymentAllocations,
  payments,
  pollVotes,
  polls,
  requestComments,
  requests,
  reservations,
  resources,
  staff,
  staffLedgerEntries,
  tenants,
  unitOccupancies,
  units,
  users,
  vendors,
  visitors,
} from "@yonetim/db";
import { allocatePayment, calculateLateFee, distributeDues } from "@yonetim/dues";

import { unitCountOf, type SiteBlueprint } from "./blueprint";
import {
  ANNOUNCEMENTS,
  EXPENSE_CATEGORIES,
  FIRST_NAMES,
  LAST_NAMES,
  MAINTENANCE,
  PARCEL_CARRIERS,
  REQUEST_COMMENTS,
  REQUESTS,
  VENDORS,
  VISIT_PURPOSES,
} from "./catalog";
import type { Rng } from "./rng";
import {
  DAY_MS,
  addDays,
  atLocalHour,
  addHours,
  addMonths,
  daysInMonth,
  istanbul,
  monthLabel,
  periodKey,
  periodOf,
  type Period,
} from "./time";

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

/** Bir demo sitesinin bütün satırları — ekleme sırası FK sırasıdır. */
export interface SitePlan {
  tenant: Insert<typeof tenants>;
  users: Insert<typeof users>[];
  blocks: Insert<typeof blocks>[];
  units: Insert<typeof units>[];
  memberships: Insert<typeof memberships>[];
  occupancies: Insert<typeof unitOccupancies>[];
  vendors: Insert<typeof vendors>[];
  bankAccounts: Insert<typeof bankAccounts>[];
  openingEntries: Insert<typeof openingEntries>[];
  expenseCategories: Insert<typeof expenseCategories>[];
  budgets: Insert<typeof budgets>[];
  operatingBudgets: Insert<typeof operatingBudgets>[];
  operatingBudgetLines: Insert<typeof operatingBudgetLines>[];
  cashMovements: Insert<typeof cashMovements>[];
  staff: Insert<typeof staff>[];
  duesPlans: Insert<typeof duesPlans>[];
  duesRuns: Insert<typeof duesRuns>[];
  debts: Insert<typeof debts>[];
  payments: Insert<typeof payments>[];
  allocations: Insert<typeof paymentAllocations>[];
  bankTransactions: Insert<typeof bankTransactions>[];
  expenses: Insert<typeof expenses>[];
  staffLedger: Insert<typeof staffLedgerEntries>[];
  meters: Insert<typeof meters>[];
  meterReadings: Insert<typeof meterReadings>[];
  requests: Insert<typeof requests>[];
  requestComments: Insert<typeof requestComments>[];
  maintenanceRecords: Insert<typeof maintenanceRecords>[];
  maintenanceLogs: Insert<typeof maintenanceLogs>[];
  announcements: Insert<typeof announcements>[];
  announcementReads: Insert<typeof announcementReads>[];
  polls: Insert<typeof polls>[];
  pollVotes: Insert<typeof pollVotes>[];
  meetings: Insert<typeof meetings>[];
  meetingAttendances: Insert<typeof meetingAttendances>[];
  meetingDecisions: Insert<typeof meetingDecisions>[];
  decisionBook: Insert<typeof decisionBookEntries>[];
  resources: Insert<typeof resources>[];
  reservations: Insert<typeof reservations>[];
  parcels: Insert<typeof parcels>[];
  visitors: Insert<typeof visitors>[];
  inventory: Insert<typeof inventoryItems>[];
  lawyers: Insert<typeof lawyers>[];
  legalCases: Insert<typeof legalCases>[];
  legalCaseEvents: Insert<typeof legalCaseEvents>[];
  certificates: Insert<typeof debtCertificates>[];
  accessRequests: Insert<typeof accessRequests>[];
  kvkkRequests: Insert<typeof kvkkRequests>[];
  notifications: Insert<typeof notifications>[];
  /** Testler ve özet için — veritabanına yazılmaz. */
  summary: SiteSummary;
}

export interface SiteSummary {
  unitCount: number;
  residentCount: number;
  debtCount: number;
  paymentCount: number;
  bankBalanceKurus: number;
  cashBalanceKurus: number;
  minBankBalanceKurus: number;
  minCashBalanceKurus: number;
  outstandingKurus: number;
}

export interface PlanContext {
  now: Date;
  /** Demo kodu — slug ve e-postalarda. */
  code: string;
  tenantId: string;
  /** Demo giriş kullanıcısı (yönetici / firma yetkilisi). */
  managerUserId: string;
  managerRole: "manager" | "company_admin";
  companyId: string | null;
  planId: string | null;
  /** Demo kişilerinin e-posta alan adı (`demo.tasci.cloud`). */
  emailDomain: string;
  /** Telefon yuvası (0–9999) ve demo içi kişi sayacı. */
  phoneSlot: number;
  personCounter: { value: number };
  /** Platform bakım şablonları (kod → kayıt). Yoksa şablonsuz kayıt yazılır. */
  templates: ReadonlyMap<string, { id: string; intervalDays: number; equipmentType: string }>;
  /** Alan şifreleme (IBAN). Kapsam: site kimliği. */
  encrypt: (plain: string, scope: string) => string;
  demoExpiresAt: Date;
}

const id = () => randomUUID();
const tl = (value: number) => Math.round(value * 100);

/* ------------------------------------------------------------------------ */

export function buildSitePlan(bp: SiteBlueprint, ctx: PlanContext, rng: Rng): SitePlan {
  const now = ctx.now;
  const current = periodOf(now);
  /** 12 geçmiş ay + içinde bulunulan ay. */
  const periods: Period[] = Array.from({ length: 13 }, (_, i) => addMonths(current, i - 12));
  const firstPeriod = periods[0]!;
  const openingDate = istanbul(firstPeriod.year, firstPeriod.month, 1, 0, 0);
  const tenantCreatedAt = addDays(openingDate, -20);
  const tenantId = ctx.tenantId;
  const managerId = ctx.managerUserId;

  const plan: SitePlan = {
    tenant: {
      id: tenantId,
      slug: `demo-${ctx.code}-${bp.key}`,
      name: bp.name,
      type: bp.type,
      unitCount: unitCountOf(bp),
      managerId,
      companyId: ctx.companyId,
      city: bp.city,
      district: bp.district,
      neighborhood: bp.neighborhood,
      addressLine: bp.addressLine,
      status: "active",
      planId: ctx.planId,
      landingPublished: false,
      isDemo: true,
      demoExpiresAt: ctx.demoExpiresAt,
      settings: {
        duesDueDayOfMonth: 10,
        lateFeeEnabled: true,
        lateFeeMonthlyPct: 5,
        currency: "TRY",
      },
      // Site satırının zamanı GERÇEK kurulum anı (geçmiş veriler kendi
      // tarihlerini taşıyor). Silme fonksiyonu "demodan sonra eklenen kişi"
      // kuralında bu ana bakıyor; geriye çekilmiş bir tarih, demoya eklenen
      // gerçek bir kişiyi yanlışlıkla silinebilir kılardı.
      createdAt: now,
      updatedAt: now,
    },
    users: [],
    blocks: [],
    units: [],
    memberships: [],
    occupancies: [],
    vendors: [],
    bankAccounts: [],
    openingEntries: [],
    expenseCategories: [],
    budgets: [],
    operatingBudgets: [],
    operatingBudgetLines: [],
    cashMovements: [],
    staff: [],
    duesPlans: [],
    duesRuns: [],
    debts: [],
    payments: [],
    allocations: [],
    bankTransactions: [],
    expenses: [],
    staffLedger: [],
    meters: [],
    meterReadings: [],
    requests: [],
    requestComments: [],
    maintenanceRecords: [],
    maintenanceLogs: [],
    announcements: [],
    announcementReads: [],
    polls: [],
    pollVotes: [],
    meetings: [],
    meetingAttendances: [],
    meetingDecisions: [],
    decisionBook: [],
    resources: [],
    reservations: [],
    parcels: [],
    visitors: [],
    inventory: [],
    lawyers: [],
    legalCases: [],
    legalCaseEvents: [],
    certificates: [],
    accessRequests: [],
    kvkkRequests: [],
    notifications: [],
    summary: {
      unitCount: 0,
      residentCount: 0,
      debtCount: 0,
      paymentCount: 0,
      bankBalanceKurus: 0,
      cashBalanceKurus: 0,
      minBankBalanceKurus: 0,
      minCashBalanceKurus: 0,
      outstandingKurus: 0,
    },
  };

  /* ------------------------------------------------ yönetici üyeliği */
  plan.memberships.push({
    tenantId,
    userId: managerId,
    role: ctx.managerRole,
    isPrimary: true,
    acceptedAt: tenantCreatedAt,
    createdAt: tenantCreatedAt,
  });

  /* ------------------------------------------------ kişi üretici */
  const usedNames = new Set<string>();
  const person = (created: Date, withEmail: boolean) => {
    let first = "";
    let last = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      first = rng.pick(FIRST_NAMES);
      last = rng.pick(LAST_NAMES);
      if (!usedNames.has(`${first} ${last}`)) break;
    }
    usedNames.add(`${first} ${last}`);
    const index = ctx.personCounter.value++;
    const userId = id();
    plan.users.push({
      id: userId,
      firstName: first,
      lastName: last,
      // +90 500 SSSS PPP — 500 hiçbir operatöre tahsis edilmemiş; gönderim
      // katmanı bu aralığa SMS'i ayrıca reddediyor.
      phone: `+90500${String(ctx.phoneSlot).padStart(4, "0")}${String(index).padStart(3, "0")}`,
      email: withEmail
        ? `${ctx.code}.k${String(index).padStart(3, "0")}.${asciiSlug(first)}@${ctx.emailDomain}`
        : null,
      locale: "tr",
      isDemo: true,
      createdAt: created,
      updatedAt: created,
    });
    return { userId, name: `${first} ${last}` };
  };

  /* ------------------------------------------------ bloklar, birimler, sakinler */
  type UnitInfo = {
    id: string;
    label: string;
    blockName: string;
    number: string;
    isShop: boolean;
    landShare: number;
    ownerId: string;
    ownerName: string;
    tenantResidentId: string | null;
    tenantResidentName: string | null;
    debtorId: string;
    debtorName: string;
    behaviour: Behaviour;
    stopAfter: number;
  };
  const unitInfos: UnitInfo[] = [];
  const totalUnits = unitCountOf(bp);
  const denominator = 1000;
  // Arsa payı paylarını 1000'e tamamla (son birim farkı alır).
  const rawShares: number[] = [];
  for (const block of bp.blocks) {
    for (let floor = 0; floor < block.floors; floor++) {
      for (let i = 0; i < block.unitsPerFloor; i++) rawShares.push(rng.int(18, 30));
    }
    for (let s = 0; s < (block.shops ?? 0); s++) rawShares.push(rng.int(30, 40));
  }
  const rawTotal = rawShares.reduce((a, b) => a + b, 0);
  const numerators = rawShares.map((v) => Math.max(1, Math.round((v / rawTotal) * denominator)));
  const drift = denominator - numerators.reduce((a, b) => a + b, 0);
  numerators[numerators.length - 1] = (numerators[numerators.length - 1] ?? 0) + drift;

  let shareIndex = 0;
  bp.blocks.forEach((block, blockIndex) => {
    const blockId = id();
    plan.blocks.push({
      id: blockId,
      tenantId,
      name: block.name,
      floorCount: block.floors,
      unitCount: block.floors * block.unitsPerFloor + (block.shops ?? 0),
      hasElevator: block.hasElevator,
      sortOrder: blockIndex,
      createdAt: tenantCreatedAt,
    });

    const make = (number: string, floor: number, isShop: boolean) => {
      const unitId = id();
      const numerator = numerators[shareIndex++] ?? 25;
      const landShare = numerator / denominator;
      const residentsSince = addDays(tenantCreatedAt, -rng.int(30, 2_000));
      const owner = person(residentsSince, rng.chance(0.7));
      const rented = !isShop && rng.chance(0.3);
      const tenantResident = rented ? person(addDays(now, -rng.int(60, 900)), rng.chance(0.6)) : null;
      const behaviour = pickBehaviour(rng);
      const area = isShop ? rng.int(60, 140) : rng.int(85, 165);
      plan.units.push({
        id: unitId,
        tenantId,
        blockId,
        number,
        floor,
        type: isShop ? "shop" : "flat",
        areaM2: String(area),
        landShare: landShare.toFixed(6),
        landShareNumerator: numerator,
        landShareDenominator: denominator,
        roomCount: isShop ? null : rng.pick(["2+1", "3+1", "3+1", "4+1"] as const),
        residentCount: isShop ? 0 : rng.int(1, 5),
        ownershipType: rented ? "tenant" : "owner",
        currentOwnerId: owner.userId,
        currentTenantId: tenantResident?.userId ?? null,
        duesMultiplier: isShop ? "1.500" : "1",
        createdAt: tenantCreatedAt,
      });
      plan.memberships.push({
        tenantId,
        userId: owner.userId,
        role: "owner",
        acceptedAt: residentsSince,
        createdAt: residentsSince,
      });
      plan.occupancies.push({
        tenantId,
        unitId,
        userId: owner.userId,
        relation: "owner",
        startDate: residentsSince,
        createdAt: residentsSince,
      });
      if (tenantResident) {
        const since = addDays(now, -rng.int(60, 900));
        plan.memberships.push({
          tenantId,
          userId: tenantResident.userId,
          role: "tenant_resident",
          acceptedAt: since,
          createdAt: since,
        });
        plan.occupancies.push({
          tenantId,
          unitId,
          userId: tenantResident.userId,
          relation: "tenant",
          startDate: since,
          debtTransferPolicy: "owner",
          createdAt: since,
        });
      }
      const debtor = tenantResident ?? owner;
      unitInfos.push({
        id: unitId,
        label: `${block.name} ${number}`,
        blockName: block.name,
        number,
        isShop,
        landShare,
        ownerId: owner.userId,
        ownerName: owner.name,
        tenantResidentId: tenantResident?.userId ?? null,
        tenantResidentName: tenantResident?.name ?? null,
        debtorId: debtor.userId,
        debtorName: debtor.name,
        behaviour,
        stopAfter: rng.int(3, 6),
      });
    };

    for (let s = 0; s < (block.shops ?? 0); s++) make(`D${s + 1}`, 0, true);
    let n = 1;
    for (let floor = 1; floor <= block.floors; floor++) {
      for (let i = 0; i < block.unitsPerFloor; i++) make(String(n++), floor, false);
    }
  });

  /* ------------------------------------------------ tedarikçiler */
  const vendorIds = new Map<string, { id: string; name: string }>();
  VENDORS.forEach((v, i) => {
    const vendorId = id();
    vendorIds.set(v.key, { id: vendorId, name: v.name });
    plan.vendors.push({
      id: vendorId,
      tenantId,
      category: v.category,
      name: v.name,
      contactName: v.contactName,
      phone: `+90216${String(5_550_000 + i * 137).slice(0, 7)}`,
      email: `${v.key}@${ctx.emailDomain}`,
      taxNumber: fakeTaxNumber(rng),
      taxOffice: v.taxOffice,
      iban: fakeIban(rng),
      address: `${v.taxOffice}, İstanbul`,
      contractEndsAt: v.key === "lift" ? addDays(now, 41) : v.key === "clean" ? addDays(now, 190) : null,
      ratingAvg: (3.6 + rng.next() * 1.3).toFixed(2),
      ratingCount: rng.int(3, 18),
      createdAt: tenantCreatedAt,
    });
  });

  /* ------------------------------------------------ banka hesabı, açılış */
  const bankId = id();
  const iban = fakeIban(rng);
  plan.bankAccounts.push({
    id: bankId,
    tenantId,
    bankName: bp.bankName,
    ibanEncrypted: ctx.encrypt(iban, tenantId),
    ibanMasked: maskIban(iban),
    accountName: `${bp.name} Yönetimi`,
    purpose: "dues",
    createdAt: tenantCreatedAt,
  });
  const openingAsOf = addDays(openingDate, -1);
  plan.openingEntries.push(
    { tenantId, asOfDate: openingAsOf, account: "cash", amountKurus: tl(bp.openingCashTl), createdBy: managerId, createdAt: tenantCreatedAt },
    { tenantId, asOfDate: openingAsOf, account: "bank", bankAccountId: bankId, amountKurus: tl(bp.openingBankTl), createdBy: managerId, createdAt: tenantCreatedAt },
  );

  /* ------------------------------------------------ gider kategorileri, bütçe */
  const categoryIds = new Map<string, string>();
  EXPENSE_CATEGORIES.forEach((c, i) => {
    const categoryId = id();
    categoryIds.set(c.key, categoryId);
    plan.expenseCategories.push({
      id: categoryId,
      tenantId,
      name: c.name,
      icon: c.icon,
      defaultVatRate: c.vatRate,
      sortOrder: i,
      createdAt: tenantCreatedAt,
    });
    const yearly =
      c.monthlyTl > 0
        ? c.monthlyTl * 12 * 1.3 * bp.expenseScale
        : c.key === "repair"
          ? 90_000 * bp.expenseScale
          : c.key === "insurance"
            ? 24_000 * bp.expenseScale
            : 0;
    if (yearly > 0) {
      plan.budgets.push({
        tenantId,
        year: current.year,
        categoryId,
        plannedKurus: tl(Math.round(yearly / 100) * 100),
        createdAt: tenantCreatedAt,
      });
    }
  });

  /* ------------------------------------------------ personel */
  const staffRows = bp.staff.map((s) => {
    const staffId = id();
    plan.staff.push({
      id: staffId,
      tenantId,
      fullName: s.fullName,
      role: s.role,
      phone: `+90500${String(ctx.phoneSlot).padStart(4, "0")}${String(ctx.personCounter.value++).padStart(3, "0")}`,
      ibanEncrypted: ctx.encrypt(fakeIban(rng), tenantId),
      grossSalaryKurus: tl(s.grossTl),
      netSalaryKurus: tl(s.netTl),
      sgkPremiumKurus: tl(s.sgkTl),
      startedAt: istanbul(addMonths(current, -s.startedMonthsAgo).year, addMonths(current, -s.startedMonthsAgo).month, 1),
      annualLeaveDays: 14,
      usedLeaveDays: rng.int(2, 9),
      createdAt: tenantCreatedAt,
    });
    return { ...s, id: staffId };
  });

  /* ------------------------------------------------ işletme projesi, kasa hareketleri */
  // Yılın onaylı işletme projesi: gider kategorisi bütçeleri + personel.
  // Aidat planına bağlı değil — demo sitenin aidatı kendi planlarından yürüyor.
  const budgetId = id();
  plan.operatingBudgets.push({
    id: budgetId,
    tenantId,
    name: `${current.year} işletme projesi`,
    startPeriod: `${current.year}-01`,
    endPeriod: `${current.year}-12`,
    formula: "land_share",
    reservePct: "5.00",
    status: "approved",
    approvedAt: istanbul(current.year, 1, 15),
    approvalNote: `${current.year} olağan genel kurulu, karar 2`,
    createdBy: managerId,
    createdAt: tenantCreatedAt,
  });
  const staffYearly = staffRows.reduce((sum, s) => sum + (s.grossTl + s.sgkTl) * 12, 0);
  if (staffYearly > 0)
    plan.operatingBudgetLines.push({
      tenantId, budgetId, isStaff: true, label: "Personel giderleri (maaş, SGK)",
      plannedKurus: tl(Math.round(staffYearly / 100) * 100), sortOrder: 0, createdAt: tenantCreatedAt,
    });
  plan.budgets.forEach((b, i) => {
    const category = plan.expenseCategories.find((c) => c.id === b.categoryId);
    plan.operatingBudgetLines.push({
      tenantId, budgetId, categoryId: b.categoryId ?? null, label: category?.name ?? "Gider",
      plannedKurus: b.plannedKurus ?? 0, sortOrder: i + 1, createdAt: tenantCreatedAt,
    });
  });

  // Aidat dışı gelir (baz istasyonu kirası, mevduat faizi) ve kasadan bankaya virman.
  const rentTl = Math.round((3_000 + rng.int(0, 4) * 500) * bp.expenseScale / 100) * 100 || 3_000;
  for (const daysAgo of [75, 45, 15]) {
    const at = addDays(now, -daysAgo);
    plan.cashMovements.push({
      tenantId, kind: "income", movementDate: at, amountKurus: tl(rentTl), toAccount: "bank", toBankAccountId: bankId,
      incomeCategory: "rent", payerName: "Baz istasyonu kiracısı", description: "Çatı kirası", createdBy: managerId, createdAt: at,
    });
  }
  plan.cashMovements.push(
    {
      tenantId, kind: "income", movementDate: addDays(now, -20), amountKurus: tl(380 + rng.int(0, 200)), toAccount: "bank",
      toBankAccountId: bankId, incomeCategory: "interest", payerName: bp.bankName, description: "Vadeli hesap faizi",
      createdBy: managerId, createdAt: addDays(now, -20),
    },
    {
      tenantId, kind: "transfer", movementDate: addDays(now, -30), amountKurus: tl(5_000), fromAccount: "cash",
      toAccount: "bank", toBankAccountId: bankId, description: "Kasadaki nakit bankaya yatırıldı", createdBy: managerId,
      createdAt: addDays(now, -30),
    },
  );

  /* ------------------------------------------------ aidat planları ve borçlar */
  const raiseAt = 6; // 7. aydan itibaren yeni plan (kurul kararıyla %25 artış)
  const raisedTl = Math.round((bp.duesTl * 1.25) / 50) * 50;
  const planOld = id();
  const planNew = id();
  const planKey = (i: number) => periodKey(periods[i]!);
  plan.duesPlans.push(
    {
      id: planOld,
      tenantId,
      name: `Aylık aidat (${monthLabel(periods[0]!)} – ${monthLabel(periods[raiseAt - 1]!)})`,
      period: "monthly",
      formula: bp.formula,
      baseAmountKurus: bp.formula === "equal" ? tl(bp.duesTl) : null,
      totalAmountKurus: bp.formula === "land_share" ? tl(bp.duesTl * totalUnits) : null,
      dueDayOfMonth: 10,
      startPeriod: planKey(0),
      endPeriod: planKey(raiseAt - 1),
      isActive: false,
      createdBy: managerId,
      createdAt: addDays(openingDate, -10),
    },
    {
      id: planNew,
      tenantId,
      name: `Aylık aidat (${monthLabel(periods[raiseAt]!)} itibarıyla)`,
      period: "monthly",
      formula: bp.formula,
      baseAmountKurus: bp.formula === "equal" ? tl(raisedTl) : null,
      totalAmountKurus: bp.formula === "land_share" ? tl(raisedTl * totalUnits) : null,
      dueDayOfMonth: 10,
      startPeriod: planKey(raiseAt),
      isActive: true,
      createdBy: managerId,
      createdAt: istanbul(periods[raiseAt]!.year, periods[raiseAt]!.month, 1, 2),
    },
  );

  type SimDebt = {
    row: Insert<typeof debts> & { id: string; amountKurus: number; dueDate: Date; createdAt: Date };
    unit: UnitInfo;
    paidKurus: number;
  };
  const simDebts: SimDebt[] = [];
  const pushDebt = (
    unit: UnitInfo,
    values: Omit<Insert<typeof debts>, "tenantId" | "unitId"> & { amountKurus: number; dueDate: Date; createdAt: Date },
  ) => {
    const row = { id: id(), tenantId, unitId: unit.id, debtorUserId: unit.debtorId, ...values };
    simDebts.push({ row, unit, paidKurus: 0 });
    return row;
  };

  periods.forEach((p, i) => {
    const planId = i < raiseAt ? planOld : planNew;
    const baseTl = i < raiseAt ? bp.duesTl : raisedTl;
    const distribution = distributeDues({
      formula: bp.formula,
      baseAmountKurus: bp.formula === "equal" ? tl(baseTl) : undefined,
      totalAmountKurus: bp.formula === "land_share" ? tl(baseTl * totalUnits) : undefined,
      units: unitInfos.map((u) => ({
        id: u.id,
        landShare: u.landShare,
        multiplier: u.isShop ? 1.5 : 1,
      })),
    });
    const createdAt = istanbul(p.year, p.month, 1, 3, rng.int(0, 20));
    // Bu ayın borçları henüz üretilmediyse (ayın 1'i 03:00'ten önce) atla.
    if (createdAt.getTime() > now.getTime()) return;
    const runId = id();
    let total = 0;
    for (const share of distribution.shares) {
      const unit = unitInfos.find((u) => u.id === share.unitId)!;
      pushDebt(unit, {
        duesPlanId: planId,
        duesRunId: runId,
        kind: "dues",
        period: periodKey(p),
        description: `${monthLabel(p)} aidatı`,
        amountKurus: share.amountKurus,
        dueDate: istanbul(p.year, p.month, Math.min(10, daysInMonth(p)), 23, 59),
        createdAt,
        updatedAt: createdAt,
      });
      total += share.amountKurus;
    }
    plan.duesRuns.push({
      id: runId,
      tenantId,
      duesPlanId: planId,
      period: periodKey(p),
      generatedCount: distribution.shares.length,
      totalKurus: total,
      status: "completed",
      createdAt,
    });
  });

  // Ek toplama: çatı yalıtımı, 2 taksit (kurul kararı — karar defterinde).
  const extraPeriod = periods[8]!;
  const extraCreated = istanbul(extraPeriod.year, extraPeriod.month, 4, 11);
  const extraPerUnit = Math.round((bp.duesTl * 1.6) / 2 / 10) * 10;
  if (extraCreated.getTime() < now.getTime()) {
    for (const unit of unitInfos) {
      for (let k = 0; k < 2; k++) {
        const dueP = addMonths(extraPeriod, k);
        pushDebt(unit, {
          debtorUserId: unit.ownerId,
          kind: "extra",
          period: periodKey(dueP),
          description: `Çatı yalıtımı ek bütçesi (${k + 1}/2)`,
          amountKurus: tl(extraPerUnit),
          dueDate: istanbul(dueP.year, dueP.month, 20, 23, 59),
          installmentNo: k + 1,
          installmentCount: 2,
          lateFeeExempt: true,
          createdAt: extraCreated,
          updatedAt: extraCreated,
        });
      }
    }
  }

  // Devir borçları — sisteme geçmeden önceki dönemden kalan (açılış).
  for (const unit of unitInfos.filter((u) => u.behaviour === "stopped").slice(0, 3)) {
    pushDebt(unit, {
      kind: "dues",
      description: "Devir borcu (önceki yönetim dönemi)",
      amountKurus: tl(bp.duesTl * rng.int(2, 4)),
      dueDate: openingAsOf,
      metadata: { opening: true },
      lateFeeExempt: true,
      createdAt: tenantCreatedAt,
      updatedAt: tenantCreatedAt,
    });
  }

  /* ------------------------------------------------ sayaçlar (su) */
  if (bp.hasMeters) {
    const unitPrice = tl(48.5); // m³ başına
    for (const unit of unitInfos) {
      const meterId = id();
      let value = rng.int(120, 900);
      plan.meters.push({
        id: meterId,
        tenantId,
        unitId: unit.id,
        type: "water",
        serialNo: `SU-${bp.key.slice(0, 2).toUpperCase()}-${unit.blockName.charAt(0)}${unit.number.padStart(3, "0")}`,
        unitPriceKurus: unitPrice,
        initialValue: String(value),
        createdAt: tenantCreatedAt,
      });
      // Son 3 dönem okuma; ilk ikisi borçlandırılmış, sonuncusu bekliyor.
      for (let k = 3; k >= 1; k--) {
        const p = addMonths(current, -k);
        const consumption = unit.isShop ? rng.int(4, 12) : rng.int(6, 22) + (rng.chance(0.04) ? 30 : 0);
        const previous = value;
        value += consumption;
        const readingDate = istanbul(p.year, p.month, daysInMonth(p), 17);
        const amount = consumption * unitPrice;
        let debtId: string | null = null;
        if (k >= 2) {
          const debtRow = pushDebt(unit, {
            kind: "utility",
            period: periodKey(p),
            description: `${monthLabel(p)} su tüketimi (${consumption} m³)`,
            amountKurus: amount,
            dueDate: addDays(readingDate, 15),
            createdAt: addDays(readingDate, 2),
            updatedAt: addDays(readingDate, 2),
          });
          debtId = debtRow.id;
        }
        plan.meterReadings.push({
          tenantId,
          meterId,
          period: periodKey(p),
          previousValue: previous.toFixed(3),
          currentValue: value.toFixed(3),
          consumption: consumption.toFixed(3),
          amountKurus: amount,
          readingDate,
          anomalyFlag: consumption > 30,
          readBy: managerId,
          debtId,
          createdAt: readingDate,
        });
      }
    }
    plan.meters.push({
      tenantId,
      type: "electric",
      serialNo: `EL-${bp.key.slice(0, 2).toUpperCase()}-ORTAK`,
      isCommon: true,
      initialValue: "18450",
      createdAt: tenantCreatedAt,
    });
  }

  /* ------------------------------------------------ tahsilat simülasyonu */
  // Her birimin borçları, birimin ödeme alışkanlığına göre ödeniyor; mahsup
  // gerçek ekranla AYNI motorla (`allocatePayment`: en eski vade, önce faiz).
  type Ledger = { at: Date; amount: number; account: "bank" | "cash"; label: string; paymentId?: string; unitId?: string; payer?: string; expenseId?: string };
  const ledger: Ledger[] = [];
  let receiptSeq = 0;

  const debtsByUnit = new Map<string, SimDebt[]>();
  for (const d of simDebts) {
    const list = debtsByUnit.get(d.unit.id) ?? [];
    list.push(d);
    debtsByUnit.set(d.unit.id, list);
  }

  for (const unit of unitInfos) {
    const list = (debtsByUnit.get(unit.id) ?? []).sort((a, b) => a.row.dueDate.getTime() - b.row.dueDate.getTime());
    const cash = unit.behaviour === "cash";
    // Ödeme günleri → o güne kadar oluşmuş açık borçlara mahsup.
    const plannedPayments = new Map<number, { at: Date; amount: number }>();
    list.forEach((d, index) => {
      if (d.row.metadata && (d.row.metadata as { opening?: boolean }).opening) return;
      const plannedAt = paymentDateFor(unit, d.row.dueDate, d.row.createdAt, index, list.length, rng, periods, d.row.period ?? null);
      if (!plannedAt || plannedAt.getTime() > now.getTime() - 3_600_000) return;
      const amount = unit.behaviour === "partial" ? Math.round((d.row.amountKurus * 0.6) / 1000) * 1000 : d.row.amountKurus;
      const key = Math.floor(plannedAt.getTime() / DAY_MS);
      const existing = plannedPayments.get(key);
      if (existing) existing.amount += amount;
      else plannedPayments.set(key, { at: plannedAt, amount });
    });

    const ordered = [...plannedPayments.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const pay of ordered) {
      const open = list
        .filter((d) => d.row.createdAt.getTime() <= pay.at.getTime() && d.paidKurus < d.row.amountKurus)
        .map((d) => ({ id: d.row.id, dueDate: d.row.dueDate, amountKurus: d.row.amountKurus, paidKurus: d.paidKurus, lateFeeKurus: 0 }));
      if (open.length === 0) continue;
      const allocation = allocatePayment(pay.amount, open);
      if (allocation.allocatedKurus <= 0) continue;
      const paymentId = id();
      const method = cash ? "cash" : unit.behaviour === "auto" ? "auto_debit" : "bank_transfer";
      const amount = allocation.allocatedKurus;
      plan.payments.push({
        id: paymentId,
        tenantId,
        unitId: unit.id,
        payerUserId: unit.debtorId,
        debtorUserId: unit.debtorId,
        amountKurus: amount,
        bankAccountId: cash ? null : bankId,
        method,
        processor: "manual",
        status: "completed",
        paidAt: pay.at,
        receiptNo: cash ? `MKB-${pay.at.getUTCFullYear()}-${String(++receiptSeq).padStart(5, "0")}` : null,
        metadata: {},
        createdAt: pay.at,
        updatedAt: pay.at,
      });
      for (const a of allocation.allocations) {
        const d = list.find((x) => x.row.id === a.debtId)!;
        d.paidKurus += a.amountKurus;
        plan.allocations.push({ tenantId, paymentId, debtId: a.debtId, amountKurus: a.amountKurus, createdAt: pay.at });
      }
      ledger.push({ at: pay.at, amount, account: cash ? "cash" : "bank", label: `${unit.label} tahsilat`, paymentId, unitId: unit.id, payer: unit.debtorName });
    }
  }

  // Son durum: ödenen tutar, gecikme tazminatı (KMK md.20, aylık %5), durum.
  for (const d of simDebts) {
    const remaining = d.row.amountKurus - d.paidKurus;
    let lateFee = 0;
    const exempt = Boolean(d.row.lateFeeExempt) || Boolean(d.row.metadata && (d.row.metadata as { opening?: boolean }).opening);
    if (remaining > 0 && !exempt && d.row.dueDate.getTime() < now.getTime()) {
      lateFee = calculateLateFee({ principalKurus: remaining, dueDate: d.row.dueDate, asOf: now }).feeKurus;
    }
    d.row.paidKurus = d.paidKurus;
    d.row.lateFeeKurus = lateFee;
    d.row.lateFeeCalculatedAt = lateFee > 0 ? now : null;
    const total = d.row.amountKurus + lateFee;
    d.row.status =
      d.paidKurus >= total ? "paid" : d.paidKurus > 0 ? "partial" : d.row.dueDate.getTime() < now.getTime() ? "overdue" : "pending";
    if (d.row.status === "paid") d.row.updatedAt = now;
    plan.debts.push(d.row);
  }

  /* ------------------------------------------------ giderler */
  let invoiceSeq = rng.int(1_000, 4_000);
  const pushExpense = (values: {
    category: string | null;
    vendor?: string;
    description: string;
    amountKurus: number;
    date: Date;
    paidAt: Date | null;
    via: "bank" | "cash";
    status?: "approved" | "paid" | "pending_approval";
    staffId?: string;
    staffKind?: "salary" | "advance";
  }) => {
    const expenseId = id();
    const spec = EXPENSE_CATEGORIES.find((c) => c.key === values.category);
    const vatRate = spec?.vatRate ?? "0.00";
    const rate = Number(vatRate);
    const vendor = values.vendor ? vendorIds.get(values.vendor) : undefined;
    const isStaff = Boolean(values.staffId);
    plan.expenses.push({
      id: expenseId,
      tenantId,
      categoryId: values.category ? (categoryIds.get(values.category) ?? null) : null,
      vendorId: vendor?.id ?? null,
      vendorName: vendor?.name ?? null,
      staffId: values.staffId ?? null,
      staffKind: values.staffKind ?? null,
      description: values.description,
      amountKurus: values.amountKurus,
      vatRate,
      vatKurus: rate > 0 ? Math.round((values.amountKurus * rate) / (1 + rate)) : 0,
      invoiceNo: isStaff || !vendor ? null : `FTR${values.date.getUTCFullYear()}${String(++invoiceSeq).padStart(9, "0")}`,
      expenseDate: values.date,
      paidAt: values.paidAt,
      paidVia: values.paidAt ? (values.via === "bank" ? "bank_transfer" : "cash") : null,
      bankAccountId: values.paidAt && values.via === "bank" ? bankId : null,
      status: values.status ?? (values.paidAt ? "paid" : "approved"),
      period: periodKey(periodOf(values.date)),
      createdBy: managerId,
      approvedBy: values.status === "pending_approval" ? null : managerId,
      createdAt: values.date,
      updatedAt: values.paidAt ?? values.date,
    });
    if (values.paidAt && values.status !== "pending_approval") {
      ledger.push({ at: values.paidAt, amount: -values.amountKurus, account: values.via, label: values.description, expenseId });
    }
    return expenseId;
  };

  periods.forEach((p, i) => {
    const isCurrent = i === periods.length - 1;
    const inflation = 1 + i * 0.02;
    for (const c of EXPENSE_CATEGORIES) {
      if (c.monthlyTl <= 0) continue;
      const day = c.key === "bank" ? daysInMonth(p) : rng.int(3, 18);
      const date = istanbul(p.year, p.month, Math.min(day, daysInMonth(p)), 11);
      if (date.getTime() > now.getTime()) continue;
      const amount = tl(Math.round((c.monthlyTl * bp.expenseScale * inflation * (0.9 + rng.next() * 0.2)) / 10) * 10);
      const unpaid = (isCurrent || i === periods.length - 2) && c.vendor !== undefined && rng.chance(isCurrent ? 0.7 : 0.35);
      const paidAt = unpaid ? null : minDate(addDays(date, rng.int(0, 9)), addHours(now, -2));
      const via = c.key === "supplies" || c.key === "garden" ? "cash" : "bank";
      pushExpense({
        category: c.key,
        vendor: c.vendor,
        description: `${c.name} — ${monthLabel(p)}`,
        amountKurus: amount,
        date,
        paidAt,
        via,
      });
    }
  });

  // Onarımlar (dönemsel) + yıllık sigorta + onay bekleyen bir gider.
  const repairs: [number, string, number][] = [
    [2, "Hidrofor pompası değişimi", 14_500],
    [5, "Çatı oluğu onarımı", 9_800],
    [9, "Çatı yalıtımı (1. hakediş)", 68_000],
    [11, "Otopark aydınlatma armatürleri", 7_400],
  ];
  for (const [i, description, amountTl] of repairs) {
    const p = periods[i]!;
    const date = istanbul(p.year, p.month, rng.int(5, 22), 14);
    if (date.getTime() > now.getTime()) continue;
    pushExpense({
      category: "repair",
      vendor: description.includes("Çatı") ? undefined : "electric",
      description,
      amountKurus: tl(Math.round(amountTl * bp.expenseScale)),
      date,
      paidAt: minDate(addDays(date, rng.int(2, 12)), addHours(now, -2)),
      via: "bank",
    });
  }
  {
    const p = periods[1]!;
    const date = istanbul(p.year, p.month, 14, 10);
    pushExpense({
      category: "insurance",
      vendor: "insurance",
      description: "Bina ve ortak alan sigortası (yıllık poliçe)",
      amountKurus: tl(Math.round(21_500 * bp.expenseScale)),
      date,
      paidAt: addDays(date, 3),
      via: "bank",
    });
  }
  pushExpense({
    category: "repair",
    vendor: "electric",
    description: "Jeneratör akü değişimi (teklif onayı bekliyor)",
    amountKurus: tl(Math.round(11_200 * bp.expenseScale)),
    date: addDays(now, -2),
    paidAt: null,
    via: "bank",
    status: "pending_approval",
  });

  /* ------------------------------------------------ personel carisi */
  // Her tamamlanan ay için maaş tahakkuku; ödeme izleyen ayın 1–5'inde.
  for (const s of staffRows) {
    const started = istanbul(addMonths(current, -s.startedMonthsAgo).year, addMonths(current, -s.startedMonthsAgo).month, 1);
    let advanceOpen = 0;
    periods.slice(0, -1).forEach((p, i) => {
      const monthStart = istanbul(p.year, p.month, 1);
      if (monthStart.getTime() < started.getTime()) return;
      const accrualAt = istanbul(p.year, p.month, daysInMonth(p), 18);
      if (accrualAt.getTime() > now.getTime()) return;
      plan.staffLedger.push({
        tenantId,
        staffId: s.id,
        kind: "accrual",
        entryDate: accrualAt,
        period: periodKey(p),
        amountKurus: tl(s.netTl),
        description: `${monthLabel(p)} net maaş tahakkuku`,
        createdBy: managerId,
        createdAt: accrualAt,
      });
      let net = tl(s.netTl);
      if (advanceOpen > 0) {
        plan.staffLedger.push({
          tenantId,
          staffId: s.id,
          kind: "advance_deduction",
          entryDate: accrualAt,
          period: periodKey(p),
          amountKurus: advanceOpen,
          description: "Avans kesintisi",
          createdBy: managerId,
          createdAt: accrualAt,
        });
        net -= advanceOpen;
        advanceOpen = 0;
      }
      const next = addMonths(p, 1);
      const payAt = istanbul(next.year, next.month, rng.int(1, 5), 10);
      if (payAt.getTime() < now.getTime()) {
        pushExpense({
          category: null,
          description: `Maaş ödemesi — ${s.fullName} (${monthLabel(p)})`,
          amountKurus: net,
          date: payAt,
          paidAt: payAt,
          via: "bank",
          staffId: s.id,
          staffKind: "salary",
        });
      }
      // İki ay önce bir kez avans.
      if (i === periods.length - 4 && s.role === "kapici") {
        const at = istanbul(p.year, p.month, 16, 12);
        advanceOpen = tl(5_000);
        pushExpense({
          category: null,
          description: `Avans — ${s.fullName}`,
          amountKurus: advanceOpen,
          date: at,
          paidAt: at,
          via: "cash",
          staffId: s.id,
          staffKind: "advance",
        });
      }
    });
  }

  /* ------------------------------------------------ banka/kasa bakiyesi */
  ledger.sort((a, b) => a.at.getTime() - b.at.getTime());
  // Kasa hiçbir an eksiye düşmesin: kasadan ödenecek gider kasayı eksiye
  // düşürecekse bankadan ödenmiş sayılır (gerçekte de yönetici böyle yapar).
  {
    let box = tl(bp.openingCashTl);
    for (const e of ledger) {
      if (e.account !== "cash") continue;
      if (e.amount < 0 && box + e.amount < 0 && e.expenseId) {
        e.account = "bank";
        const row = plan.expenses.find((x) => x.id === e.expenseId);
        if (row) {
          row.paidVia = "bank_transfer";
          row.bankAccountId = bankId;
        }
        continue;
      }
      box += e.amount;
    }
  }
  let bank = tl(bp.openingBankTl);
  let cashBox = tl(bp.openingCashTl);
  let minBank = bank;
  let minCash = cashBox;
  const windowStart = addDays(now, -75);
  let extSeq = 1;
  for (const e of ledger) {
    if (e.account === "bank") {
      bank += e.amount;
      minBank = Math.min(minBank, bank);
      if (e.at.getTime() >= windowStart.getTime()) {
        plan.bankTransactions.push({
          tenantId,
          accountId: bankId,
          externalId: `EKS-${String(extSeq++).padStart(6, "0")}`,
          direction: e.amount >= 0 ? "in" : "out",
          amountKurus: Math.abs(e.amount),
          balanceAfterKurus: bank,
          counterparty: e.payer ?? null,
          description: e.amount >= 0 ? `${e.label}` : e.label,
          transactionAt: e.at,
          matchedPaymentId: e.paymentId ?? null,
          matchedUnitId: e.unitId ?? null,
          matchStatus: e.amount >= 0 ? "auto" : "ignored",
          matchConfidence: e.amount >= 0 ? "0.960" : null,
          provider: "csv",
          createdAt: e.at,
        });
      }
    } else {
      cashBox += e.amount;
      minCash = Math.min(minCash, cashBox);
    }
  }
  // Ekstrede olup henüz eşleşmemiş üç havale — mutabakat ekranında iş çıksın.
  const unmatched: [number, string, string][] = [
    [rng.int(1, 4), "MEHMET K.", "AIDAT"],
    [rng.int(2, 6), "S. YILDIRIM", "B BLOK 7 ODEME"],
    [rng.int(3, 9), "AYŞE DEMİR", "EKİM AIDAT VE SU"],
  ];
  for (const [daysAgo, who, text] of unmatched) {
    const amount = tl(bp.duesTl * (rng.chance(0.5) ? 1 : 1.25));
    bank += amount;
    const suggested = text.includes("B BLOK") ? unitInfos.find((u) => u.blockName.startsWith("B") && u.number === "7") : undefined;
    plan.bankTransactions.push({
      tenantId,
      accountId: bankId,
      externalId: `EKS-${String(extSeq++).padStart(6, "0")}`,
      direction: "in",
      amountKurus: amount,
      balanceAfterKurus: bank,
      counterparty: who,
      description: text,
      transactionAt: addDays(now, -daysAgo),
      matchedUnitId: suggested?.id ?? null,
      matchStatus: suggested ? "suggested" : "unmatched",
      matchConfidence: suggested ? "0.620" : null,
      provider: "csv",
      createdAt: addDays(now, -daysAgo),
    });
  }
  plan.bankAccounts[0]!.balanceKurus = bank;
  plan.bankAccounts[0]!.lastSyncedAt = addDays(now, -1);
  plan.bankAccounts[0]!.syncStatus = "idle";

  /* ------------------------------------------------ talepler (arıza/bakım) */
  const residentUnits = unitInfos.filter((u) => !u.isShop);
  const requestCount = 14 + rng.int(0, 2);
  const requestRows: { id: string; createdAt: Date; status: string }[] = [];
  for (let k = 0; k < requestCount; k++) {
    const spec = REQUESTS[(k + bp.key.length) % REQUESTS.length]!;
    const unit = rng.pick(residentUnits);
    const createdAt = addHours(now, -rng.int(2, 24 * 95));
    const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;
    const status: Insert<typeof requests>["status"] =
      ageDays > 30
        ? rng.pick(["closed", "closed", "resolved", "rejected"] as const)
        : ageDays > 8
          ? rng.pick(["resolved", "closed", "in_progress", "waiting_resident"] as const)
          : rng.pick(["open", "open", "assigned", "in_progress"] as const);
    const slaHours = { critical: 4, high: 24, normal: 72, low: 168 }[spec.priority];
    const slaDueAt = addHours(createdAt, slaHours);
    const responded = status !== "open";
    const firstResponseAt = responded ? addHours(createdAt, Math.min(slaHours * 0.8, rng.int(1, 30))) : null;
    const done = status === "resolved" || status === "closed";
    const resolvedAt = done ? addHours(createdAt, rng.int(4, 24 * 6)) : null;
    const vendorKey = spec.category === "asansor" ? "lift" : spec.category === "elektrik" ? "electric" : spec.category === "su" ? "water" : undefined;
    const requestId = id();
    plan.requests.push({
      id: requestId,
      tenantId,
      unitId: unit.id,
      createdByUserId: unit.tenantResidentId ?? unit.ownerId,
      code: "", // aşağıda yıl içi sırayla
      category: spec.category,
      title: spec.title,
      description: spec.description,
      priority: spec.priority,
      status,
      assignedToUserId: responded ? managerId : null,
      assignedVendorId: responded && vendorKey ? (vendorIds.get(vendorKey)?.id ?? null) : null,
      slaDueAt,
      slaBreachedAt: !done && slaDueAt.getTime() < now.getTime() ? slaDueAt : null,
      firstResponseAt,
      resolvedAt: resolvedAt && resolvedAt.getTime() < now.getTime() ? resolvedAt : done ? addHours(now, -1) : null,
      closedAt: status === "closed" && resolvedAt ? minDate(addDays(resolvedAt, 1), addHours(now, -1)) : null,
      costKurus: done && vendorKey ? tl(rng.int(4, 30) * 100) : 0,
      satisfactionScore: status === "closed" ? rng.int(3, 5) : null,
      source: rng.pick(["web", "web", "mobile", "whatsapp"] as const),
      createdAt,
      updatedAt: resolvedAt ?? firstResponseAt ?? createdAt,
    });
    requestRows.push({ id: requestId, createdAt, status });
    if (responded) {
      const commentCount = done ? rng.int(2, 3) : rng.int(1, 2);
      for (let c = 0; c < commentCount; c++) {
        const at = addHours(createdAt, (c + 1) * rng.int(2, 20));
        if (at.getTime() > now.getTime()) break;
        const fromResident = c === commentCount - 1 && done;
        plan.requestComments.push({
          tenantId,
          requestId,
          userId: fromResident ? (unit.tenantResidentId ?? unit.ownerId) : managerId,
          body: fromResident ? REQUEST_COMMENTS[4] : REQUEST_COMMENTS[Math.min(c, 3)]!,
          isInternal: !fromResident && c === 1 && rng.chance(0.3),
          createdAt: at,
        });
      }
    }
  }
  // Talep kodu: yıl içinde oluşturulma sırasıyla (TLP-2026-0001).
  const byYear = new Map<number, number>();
  [...plan.requests]
    .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
    .forEach((r) => {
      const year = periodOf(r.createdAt as Date).year;
      const next = (byYear.get(year) ?? 0) + 1;
      byYear.set(year, next);
      r.code = `TLP-${year}-${String(next).padStart(4, "0")}`;
    });

  /* ------------------------------------------------ planlı bakımlar */
  for (const m of MAINTENANCE) {
    const template = ctx.templates.get(m.templateCode);
    const interval = template?.intervalDays ?? 180;
    const lastDoneAt = addDays(now, -m.lastDoneDaysAgo);
    const recordId = id();
    const vendor = m.vendor ? vendorIds.get(m.vendor) : undefined;
    plan.maintenanceRecords.push({
      id: recordId,
      tenantId,
      templateId: template?.id ?? null,
      equipmentType: template?.equipmentType ?? m.templateCode,
      label: m.label,
      location: m.location,
      vendorId: vendor?.id ?? null,
      intervalDays: interval,
      lastDoneAt,
      nextDueAt: addDays(lastDoneAt, interval),
      lastCostKurus: tl(Math.round(m.costTl * bp.expenseScale)),
      notes: vendor ? `Sözleşmeli firma: ${vendor.name}` : null,
      createdAt: tenantCreatedAt,
    });
    // Son bir yılın geçmişi.
    for (let at = lastDoneAt; at.getTime() > addDays(now, -370).getTime(); at = addDays(at, -interval)) {
      plan.maintenanceLogs.push({
        tenantId,
        recordId,
        doneAt: at,
        costKurus: tl(Math.round(m.costTl * bp.expenseScale * (0.92 + rng.next() * 0.1))),
        note: at.getTime() === lastDoneAt.getTime() ? "Bakım raporu firmadan teslim alındı." : null,
        createdByUserId: managerId,
        createdAt: at,
      });
      if (interval > 370) break;
    }
  }

  /* ------------------------------------------------ duyurular */
  const residentUserIds = plan.users.map((u) => u.id!);
  ANNOUNCEMENTS.forEach((a) => {
    const announcementId = id();
    const publishedAt = addDays(now, -a.daysAgo);
    plan.announcements.push({
      id: announcementId,
      tenantId,
      title: a.title,
      body: a.body,
      audience: "all",
      channels: ["in_app"],
      isUrgent: a.urgent,
      publishedAt,
      expiresAt: a.urgent ? addDays(publishedAt, 7) : null,
      createdBy: managerId,
      createdAt: publishedAt,
    });
    for (const userId of residentUserIds) {
      if (!rng.chance(a.daysAgo > 20 ? 0.75 : 0.45)) continue;
      plan.announcementReads.push({
        tenantId,
        announcementId,
        userId,
        readAt: addHours(publishedAt, rng.int(1, 72)),
      });
    }
  });

  /* ------------------------------------------------ anket */
  const pollId = id();
  const pollOpened = addDays(now, -6);
  plan.polls.push({
    id: pollId,
    tenantId,
    question: "Bahçeye çocuk oyun grubu eklensin mi?",
    description: "Teklif tutarı 85.000 TL; ek toplama yapılmadan işletme bütçesinden karşılanacak.",
    options: [
      { id: "opt1", label: "Evet, eklensin" },
      { id: "opt2", label: "Hayır" },
      { id: "opt3", label: "Fikrim yok" },
    ],
    weightMode: "equal",
    quorumRule: "simple_majority",
    visibility: "open",
    ownersOnly: true,
    opensAt: pollOpened,
    closesAt: addDays(now, 5),
    createdBy: managerId,
    createdAt: pollOpened,
  });
  for (const unit of unitInfos) {
    if (unit.isShop || !rng.chance(0.48)) continue;
    plan.pollVotes.push({
      tenantId,
      pollId,
      unitId: unit.id,
      userId: unit.ownerId,
      optionId: rng.chance(0.62) ? "opt1" : rng.chance(0.7) ? "opt2" : "opt3",
      weight: "1",
      createdAt: addHours(pollOpened, rng.int(1, 140)),
    });
  }

  /* ------------------------------------------------ toplantı ve karar defteri */
  const heldPeriod = periods[raiseAt - 1]!;
  const heldAt = istanbul(heldPeriod.year, heldPeriod.month, Math.min(24, daysInMonth(heldPeriod)), 14);
  const heldId = id();
  const attendees = unitInfos.filter((u) => !u.isShop && rng.chance(0.62));
  const attendanceShare = attendees.reduce((s, u) => s + u.landShare, 0);
  plan.meetings.push({
    id: heldId,
    tenantId,
    title: `${heldPeriod.year} yılı olağan kat malikleri kurulu`,
    kind: "ordinary",
    scheduledAt: heldAt,
    secondCallAt: addDays(heldAt, 7),
    location: "Toplantı salonu",
    agenda: [
      "Açılış ve divan heyeti seçimi",
      "Yönetim faaliyet raporu ve denetim raporu",
      "İşletme projesi ve aidat tutarının görüşülmesi",
      "Çatı yalıtımı ek bütçesi",
      "Yönetici ve denetçi seçimi",
    ],
    attendanceShare: attendanceShare.toFixed(4),
    quorumMet: true,
    status: "held",
    noticeSentAt: addDays(heldAt, -21),
    noticeMethod: "in_app",
    createdBy: managerId,
    createdAt: addDays(heldAt, -25),
  });
  for (const unit of attendees) {
    const proxy = rng.chance(0.12);
    plan.meetingAttendances.push({
      tenantId,
      meetingId: heldId,
      unitId: unit.id,
      ownerName: unit.ownerName,
      proxyName: proxy ? rng.pick(FIRST_NAMES) + " " + rng.pick(LAST_NAMES) : null,
      landShare: unit.landShare.toFixed(6),
      createdBy: managerId,
      createdAt: heldAt,
    });
  }
  const votes = attendees.length;
  const decisions = [
    { title: `Aidatın ${raisedTl.toLocaleString("tr-TR")} TL'ye yükseltilmesi`, body: `${monthLabel(periods[raiseAt]!)} itibarıyla aylık aidatın ${raisedTl.toLocaleString("tr-TR")} TL olarak uygulanmasına, işletme projesinin bu tutar üzerinden kabulüne karar verildi.`, rule: "simple_majority" as const, against: 4 },
    { title: "Çatı yalıtımı ek bütçesi", body: `Çatı yalıtımı için bağımsız bölüm başına ${(extraPerUnit * 2).toLocaleString("tr-TR")} TL ek bütçenin iki taksitte toplanmasına karar verildi.`, rule: "simple_majority" as const, against: 6 },
    { title: "Yönetici seçimi", body: "Mevcut yöneticinin bir yıl süreyle yeniden görevlendirilmesine oy birliğiyle karar verildi.", rule: "simple_majority" as const, against: 0 },
  ];
  decisions.forEach((d, i) => {
    const forVotes = Math.max(0, votes - d.against - (i === 1 ? 2 : 0));
    plan.meetingDecisions.push({
      tenantId,
      meetingId: heldId,
      decisionNo: i + 1,
      title: d.title,
      body: d.body,
      quorumRule: d.rule,
      votesFor: String(forVotes),
      votesAgainst: String(d.against),
      abstentions: i === 1 ? "2" : "0",
      passed: true,
      ledgerPageNo: 14 + i,
      createdAt: heldAt,
    });
    plan.decisionBook.push({
      tenantId,
      entryNo: i + 1,
      decidedAt: heldAt,
      kind: "kurul",
      meetingId: heldId,
      subject: d.title,
      body: d.body,
      quorumRule: d.rule,
      votesFor: String(forVotes),
      votesAgainst: String(d.against),
      abstentions: i === 1 ? "2" : "0",
      passed: true,
      bookPageNo: 14 + i,
      createdBy: managerId,
      createdAt: heldAt,
    });
  });
  plan.decisionBook.push({
    tenantId,
    entryNo: 4,
    decidedAt: addDays(now, -33),
    kind: "yonetim",
    subject: "Asansör bakım sözleşmesinin yenilenmesi",
    body: "Kuzey Asansör Bakım Ltd. ile aylık bakım sözleşmesinin aynı koşullarla bir yıl uzatılmasına karar verildi.",
    quorumRule: "simple_majority",
    votesFor: "3",
    votesAgainst: "0",
    abstentions: "0",
    passed: true,
    bookPageNo: 17,
    createdBy: managerId,
    createdAt: addDays(now, -33),
  });
  const upcomingAt = atLocalHour(addDays(now, 18), 14);
  plan.meetings.push({
    tenantId,
    title: "Olağanüstü kurul — otopark düzenlemesi",
    kind: "extraordinary",
    scheduledAt: upcomingAt,
    secondCallAt: addDays(upcomingAt, 7),
    location: "Toplantı salonu",
    agenda: ["Otopark yer tahsisi", "Misafir aracı kuralları", "Dilek ve temenniler"],
    status: "planned",
    noticeSentAt: addDays(now, -3),
    noticeMethod: "in_app",
    createdBy: managerId,
    createdAt: addDays(now, -4),
  });

  /* ------------------------------------------------ ortak alanlar ve rezervasyon */
  bp.resources.forEach((r) => {
    const resourceId = id();
    plan.resources.push({
      id: resourceId,
      tenantId,
      name: r.name,
      kind: r.kind,
      capacity: r.capacity,
      requiresApproval: r.requiresApproval,
      openHour: r.openHour,
      closeHour: r.closeHour,
      rulesText: r.rulesText,
      createdAt: tenantCreatedAt,
    });
    const slots: [number, number, Insert<typeof reservations>["status"]][] = [
      [-12, 3, "completed"],
      [-5, 2, "completed"],
      [2, 3, r.requiresApproval ? "approved" : "approved"],
      [4, 2, r.requiresApproval ? "pending" : "approved"],
      [9, 4, r.requiresApproval ? "pending" : "approved"],
    ];
    for (const [dayOffset, hours, status] of slots) {
      const unit = rng.pick(residentUnits);
      const day = addDays(now, dayOffset);
      const startHour = Math.max(r.openHour, Math.min(r.closeHour - hours, rng.int(10, 18)));
      const startAt = atLocalHour(day, startHour);
      plan.reservations.push({
        tenantId,
        resourceId,
        unitId: unit.id,
        userId: unit.tenantResidentId ?? unit.ownerId,
        startAt,
        endAt: addHours(startAt, hours),
        guestCount: rng.int(1, Math.max(1, Math.min(10, r.capacity))),
        status,
        approvedBy: status === "approved" || status === "completed" ? managerId : null,
        note: dayOffset > 0 && rng.chance(0.4) ? "Doğum günü kutlaması" : null,
        createdAt: addDays(startAt, -rng.int(2, 8)),
      });
    }
  });

  /* ------------------------------------------------ kargo ve ziyaretçi */
  for (let k = 0; k < 9; k++) {
    const unit = rng.pick(residentUnits);
    const receivedAt = addHours(now, -rng.int(1, 24 * 6));
    const delivered = k < 6;
    plan.parcels.push({
      tenantId,
      unitId: unit.id,
      recipientName: unit.tenantResidentName ?? unit.ownerName,
      carrier: rng.pick(PARCEL_CARRIERS),
      trackingNo: String(rng.int(100_000_000, 999_999_999)),
      receivedAt,
      receivedBy: managerId,
      deliveredAt: delivered ? minDate(addHours(receivedAt, rng.int(1, 30)), addHours(now, -1)) : null,
      deliveredTo: delivered ? (unit.tenantResidentName ?? unit.ownerName) : null,
      deliveredBy: delivered ? managerId : null,
      createdAt: receivedAt,
    });
  }
  for (let k = 0; k < 11; k++) {
    const unit = rng.pick(residentUnits);
    const arrivedAt = addHours(now, -rng.int(1, 24 * 4));
    const left = k > 2;
    plan.visitors.push({
      tenantId,
      unitId: unit.id,
      visitorName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      plate: rng.chance(0.5) ? `34 ${String.fromCharCode(65 + rng.int(0, 25))}${String.fromCharCode(65 + rng.int(0, 25))} ${rng.int(100, 9999)}` : null,
      purpose: rng.pick(VISIT_PURPOSES),
      arrivedAt,
      leftAt: left ? minDate(addHours(arrivedAt, rng.int(1, 5)), addHours(now, -1)) : null,
      createdBy: managerId,
      createdAt: arrivedAt,
    });
  }

  /* ------------------------------------------------ demirbaş */
  const kapici = staffRows.find((s) => s.role === "kapici");
  const inventory: [string, string, string, number, number, Insert<typeof inventoryItems>["status"]][] = [
    ["DMB-001", "Yangın tüpü 6 kg KKT", "safety", 18, 950, "active"],
    ["DMB-002", "Çim biçme makinesi", "garden", 1, 14_500, "active"],
    ["DMB-003", "Güvenlik kamerası kayıt cihazı (NVR)", "electronics", 1, 22_000, "active"],
    ["DMB-004", "Toplantı salonu sandalyesi", "furniture", 40, 1_250, "active"],
    ["DMB-005", "Endüstriyel süpürge", "cleaning", 1, 8_900, "in_repair"],
    ["DMB-006", "Çocuk parkı salıncak seti", "playground", 1, 36_000, "active"],
  ];
  for (const [code, name, category, quantity, priceTl, status] of inventory) {
    const purchased = addDays(now, -rng.int(90, 1_400));
    plan.inventory.push({
      tenantId,
      code,
      name,
      category,
      location: category === "garden" ? "Bahçe deposu" : category === "furniture" ? "Toplantı salonu" : "Yönetim odası",
      quantity,
      purchaseDate: purchased,
      purchasePriceKurus: tl(priceTl * bp.expenseScale),
      warrantyUntil: category === "electronics" ? addDays(purchased, 730) : null,
      status,
      responsibleStaffId: kapici?.id ?? null,
      createdAt: purchased,
    });
  }

  /* ------------------------------------------------ hukuk */
  const worst = unitInfos
    .filter((u) => u.behaviour === "stopped")
    .map((u) => ({
      unit: u,
      open: plan.debts
        .filter((d) => d.unitId === u.id)
        .reduce((s, d) => s + (d.amountKurus as number) + ((d.lateFeeKurus as number | undefined) ?? 0) - ((d.paidKurus as number | undefined) ?? 0), 0),
    }))
    .sort((a, b) => b.open - a.open)[0];
  if (worst && worst.open > 0) {
    const lawyerId = id();
    plan.lawyers.push({
      tenantId,
      name: "Av. Selin Aktaş",
      barNo: String(rng.int(20_000, 69_999)),
      barCity: "İstanbul",
      phone: `+90500${String(ctx.phoneSlot).padStart(4, "0")}${String(ctx.personCounter.value++).padStart(3, "0")}`,
      email: `${ctx.code}.avukat@${ctx.emailDomain}`,
      commissionPct: "10",
      id: lawyerId,
      createdAt: addDays(now, -40),
    });
    const caseId = id();
    const opened = addDays(now, -21);
    const principal = plan.debts
      .filter((d) => d.unitId === worst.unit.id)
      .reduce((s, d) => s + Math.max(0, (d.amountKurus as number) - ((d.paidKurus as number | undefined) ?? 0)), 0);
    const interest = plan.debts.filter((d) => d.unitId === worst.unit.id).reduce((s, d) => s + ((d.lateFeeKurus as number | undefined) ?? 0), 0);
    plan.legalCases.push({
      id: caseId,
      tenantId,
      unitId: worst.unit.id,
      debtorUserId: worst.unit.debtorId,
      lawyerId,
      stage: "warning_letter",
      principalKurus: principal,
      interestKurus: interest,
      costsKurus: tl(1_150),
      collectionScore: 42,
      nextActionAt: addDays(now, 9),
      nextActionNote: "İhtarnamede verilen 30 günlük süre doluyor; ödeme yoksa icra takibi başlatılacak.",
      openedAt: opened,
      createdAt: opened,
    });
    plan.legalCaseEvents.push({
      tenantId,
      caseId,
      stage: "warning_letter",
      title: "Noter ihtarnamesi gönderildi",
      note: "Kadıköy 12. Noterliği aracılığıyla tebliğe çıkarıldı.",
      occurredAt: opened,
      createdBy: managerId,
      createdAt: opened,
    });
  }

  /* ------------------------------------------------ borcu yoktur belgeleri */
  const clean = unitInfos.filter((u) => u.behaviour === "prompt").slice(0, 2);
  clean.forEach((u, k) => {
    const at = addDays(now, -rng.int(3, 40));
    plan.certificates.push({
      tenantId,
      unitId: u.id,
      requestedBy: managerId,
      result: "clear",
      outstandingKurus: 0,
      asOfDate: at,
      serialNo: `BYB-${periodOf(at).year}-${String(k + 1).padStart(6, "0")}`,
      verificationCode: readableCode(8),
      createdAt: at,
    });
  });

  /* ------------------------------------------------ erişim talepleri, KVKK */
  const pendingUnit = residentUnits[residentUnits.length - 1]!;
  plan.accessRequests.push(
    {
      tenantId,
      fullName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: `+90500${String(ctx.phoneSlot).padStart(4, "0")}${String(ctx.personCounter.value++).padStart(3, "0")}`,
      email: null,
      blockLabel: pendingUnit.blockName,
      unitLabel: pendingUnit.number,
      claimedRelation: "tenant",
      note: "Geçen ay taşındım, kira sözleşmem ektedir.",
      createdAt: addHours(now, -rng.int(3, 40)),
    },
  );
  const kvkkUnit = rng.pick(residentUnits);
  plan.kvkkRequests.push({
    tenantId,
    userId: kvkkUnit.ownerId,
    type: "access",
    status: "received",
    detail: "Hakkımda tutulan kişisel verilerin bir kopyasını talep ediyorum.",
    dueAt: addDays(now, 26),
    createdAt: addDays(now, -4),
  });

  /* ------------------------------------------------ yönetici bildirimleri */
  const openRequest = requestRows.filter((r) => r.status === "open").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const recentPayment = [...plan.payments].sort((a, b) => (b.paidAt as Date).getTime() - (a.paidAt as Date).getTime())[0];
  const note = (template: string, subject: string, body: string, resourceType: string | null, resourceId: string | null, hoursAgo: number, read: boolean) => {
    const at = addHours(now, -hoursAgo);
    plan.notifications.push({
      tenantId,
      userId: managerId,
      channel: "in_app",
      template,
      recipient: managerId,
      subject,
      body,
      status: read ? "read" : "sent",
      sentAt: at,
      readAt: read ? addHours(at, 1) : null,
      resourceType,
      resourceId,
      createdAt: at,
    });
  };
  if (openRequest) note("request_created", "Yeni arıza kaydı", "Bir sakin yeni bir arıza kaydı oluşturdu.", "request", openRequest.id, 3, false);
  if (recentPayment) note("payment_received", "Tahsilat alındı", "Bir bağımsız bölümden aidat tahsilatı kaydedildi.", "payment", recentPayment.id as string, 7, false);
  note("access_request_new", "Yeni erişim talebi", "Bir kişi siteye erişim talep etti. Sakinler → Talepler ekranından inceleyin.", "access_request", null, 20, false);
  note("maintenance_due", "Bakım zamanı yaklaşıyor", "Su deposu temizliğinin zamanı yaklaşıyor.", null, null, 30, true);

  /* ------------------------------------------------ özet */
  const outstanding = plan.debts.reduce(
    (s, d) => s + (d.amountKurus as number) + ((d.lateFeeKurus as number | undefined) ?? 0) - ((d.paidKurus as number | undefined) ?? 0),
    0,
  );
  plan.summary = {
    unitCount: unitInfos.length,
    residentCount: plan.users.length,
    debtCount: plan.debts.length,
    paymentCount: plan.payments.length,
    bankBalanceKurus: bank,
    cashBalanceKurus: cashBox,
    minBankBalanceKurus: minBank,
    minCashBalanceKurus: minCash,
    outstandingKurus: outstanding,
  };
  return plan;
}

/* ------------------------------------------------------------------------ */

type Behaviour = "prompt" | "auto" | "cash" | "late" | "partial" | "stopped" | "recent";

function pickBehaviour(rng: Rng): Behaviour {
  const r = rng.next();
  if (r < 0.53) return "prompt";
  if (r < 0.62) return "auto";
  if (r < 0.68) return "cash";
  if (r < 0.83) return "late";
  if (r < 0.89) return "partial";
  if (r < 0.93) return "stopped";
  return "recent";
}

/** Borcun ödeneceği an — birimin alışkanlığına göre; `null` = ödenmez. */
function paymentDateFor(
  unit: { behaviour: Behaviour; stopAfter: number },
  dueDate: Date,
  createdAt: Date,
  index: number,
  count: number,
  rng: Rng,
  periods: Period[],
  period: string | null,
): Date | null {
  const periodIndex = period ? periods.findIndex((p) => periodKey(p) === period) : -1;
  const fromEnd = periodIndex >= 0 ? periods.length - 1 - periodIndex : count - 1 - index;
  const earliest = addHours(createdAt, 6);
  const clamp = (d: Date) => (d.getTime() < earliest.getTime() ? earliest : d);
  switch (unit.behaviour) {
    case "prompt":
      return clamp(addDays(dueDate, rng.int(-7, 1)));
    case "auto":
      return clamp(addHours(dueDate, -12));
    case "cash":
      return rng.chance(0.08) ? null : clamp(addDays(dueDate, rng.int(-3, 6)));
    case "late":
      return fromEnd <= 1 && rng.chance(0.6) ? null : clamp(addDays(dueDate, rng.int(20, 48)));
    case "partial":
      return clamp(addDays(dueDate, rng.int(-2, 10)));
    case "stopped":
      return fromEnd >= unit.stopAfter ? clamp(addDays(dueDate, rng.int(-3, 12))) : null;
    case "recent":
      return fromEnd <= 1 ? null : clamp(addDays(dueDate, rng.int(-5, 3)));
  }
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() < b.getTime() ? a : b;
}

function asciiSlug(value: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i" };
  return value
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

/** Biçimce geçerli ama hiçbir hesaba ait olmayan TR IBAN (kontrol hanesiyle). */
function fakeIban(rng: Rng): string {
  const bank = String(rng.int(10, 99)).padStart(5, "0");
  let account = "";
  for (let i = 0; i < 17; i++) account += String(rng.int(0, 9));
  const bban = `${bank}0${account}`;
  const numeric = `${bban}2927` + "00"; // T=29, R=27
  let remainder = 0;
  for (const ch of numeric) remainder = (remainder * 10 + Number(ch)) % 97;
  const check = String(98 - remainder).padStart(2, "0");
  return `TR${check}${bban}`;
}

function fakeTaxNumber(rng: Rng): string {
  let out = "";
  for (let i = 0; i < 10; i++) out += String(rng.int(0, 9));
  return out;
}

function readableCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[buf[i]! % alphabet.length];
  return out;
}
