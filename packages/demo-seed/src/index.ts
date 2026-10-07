import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import type { Database } from "@yonetim/db";
import {
  accessRequests,
  announcementReads,
  announcements,
  bankAccounts,
  bankTransactions,
  blocks,
  budgets,
  companies,
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
  maintenanceTemplates,
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
  plans,
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
import { planForUnitCount } from "@yonetim/pricing";

import { blueprintsFor, unitCountOf } from "./blueprint";
import { buildSitePlan, type SitePlan, type SiteSummary } from "./plan";
import { createRng } from "./rng";

export { SITE_BLUEPRINTS, blueprintsFor, unitCountOf } from "./blueprint";
export { buildSitePlan, type SitePlan, type SiteSummary } from "./plan";
export { createRng } from "./rng";

export type DemoKind = "manager" | "company";

export interface ProvisionDemoInput {
  kind: DemoKind;
  /** Demo kodu (`demo_requests.code`) — slug ve adreslerde görünür. */
  code: string;
  now: Date;
  expiresAt: Date;
  manager: {
    firstName: string;
    lastName: string | null;
    loginEmail: string;
    passwordHash: string;
  };
  phoneSlot: number;
  /** Demo kişi adreslerinin alan adı — gönderim katmanı bu alana mail atmaz. */
  emailDomain: string;
  encrypt: (plain: string, scope: string) => string;
}

export interface ProvisionDemoResult {
  userId: string;
  companyId: string | null;
  tenantIds: string[];
  sites: { tenantId: string; slug: string; name: string; summary: SiteSummary }[];
}

/**
 * Demo hesabını kurar — **tek transaction** içinde çağrılmalı (baypas rolü).
 *
 * Hata olursa transaction geri alınır ve geride yarım site kalmaz; bu yüzden
 * üretim sırasında temizlik gerekmiyor. İçerik herkeste aynı (site başına
 * sabit tohum), yalnız tarihler `now`'a göre kayıyor.
 */
export async function provisionDemo(tx: Database, input: ProvisionDemoInput): Promise<ProvisionDemoResult> {
  const blueprints = blueprintsFor(input.kind);
  const userId = randomUUID();
  const companyId = input.kind === "company" ? randomUUID() : null;
  const createdAt = input.now;

  await tx.insert(users).values({
    id: userId,
    email: input.manager.loginEmail,
    emailVerifiedAt: createdAt,
    firstName: input.manager.firstName,
    lastName: input.manager.lastName,
    passwordHash: input.manager.passwordHash,
    locale: "tr",
    isDemo: true,
    createdAt,
    updatedAt: createdAt,
  });

  if (companyId) {
    await tx.insert(companies).values({
      id: companyId,
      name: "Örnek Yönetim Hizmetleri (Demo)",
      slug: `demo-${input.code}`,
      email: input.manager.loginEmail,
      address: "Ataşehir, İstanbul",
      isDemo: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const templateRows = await tx
    .select({
      id: maintenanceTemplates.id,
      code: maintenanceTemplates.code,
      intervalDays: maintenanceTemplates.intervalDays,
      equipmentType: maintenanceTemplates.equipmentType,
    })
    .from(maintenanceTemplates);
  const templates = new Map(templateRows.map((t) => [t.code, t]));

  const planCodes = blueprints.map((bp) => planForUnitCount(unitCountOf(bp)).code);
  const planRows = planCodes.length
    ? await tx.select({ id: plans.id, code: plans.code }).from(plans).where(inArray(plans.code, planCodes))
    : [];
  const planIdByCode = new Map(planRows.map((p) => [p.code, p.id]));

  const personCounter = { value: 0 };
  const sites: ProvisionDemoResult["sites"] = [];

  for (const bp of blueprints) {
    const tenantId = randomUUID();
    const plan = buildSitePlan(
      bp,
      {
        now: input.now,
        code: input.code,
        tenantId,
        managerUserId: userId,
        managerRole: companyId ? "company_admin" : "manager",
        companyId,
        planId: planIdByCode.get(planForUnitCount(unitCountOf(bp)).code) ?? null,
        emailDomain: input.emailDomain,
        phoneSlot: input.phoneSlot,
        personCounter,
        templates,
        encrypt: input.encrypt,
        demoExpiresAt: input.expiresAt,
      },
      createRng(seedFor(bp.key)),
    );
    await insertPlan(tx, plan);
    sites.push({ tenantId, slug: plan.tenant.slug, name: plan.tenant.name, summary: plan.summary });
  }

  return { userId, companyId, tenantIds: sites.map((s) => s.tenantId), sites };
}

/** Site anahtarından sabit tohum — aynı site her demoda aynı veriyi alır. */
export function seedFor(key: string): number {
  let hash = 2166136261;
  for (const ch of key) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

async function insertPlan(tx: Database, plan: SitePlan): Promise<void> {
  await tx.insert(tenants).values(plan.tenant);
  // Sıra yabancı anahtar sırasıdır.
  const steps: [PgTable, unknown[]][] = [
    [users, plan.users],
    [blocks, plan.blocks],
    [units, plan.units],
    [memberships, plan.memberships],
    [unitOccupancies, plan.occupancies],
    [vendors, plan.vendors],
    [bankAccounts, plan.bankAccounts],
    [openingEntries, plan.openingEntries],
    [expenseCategories, plan.expenseCategories],
    [budgets, plan.budgets],
    [staff, plan.staff],
    [duesPlans, plan.duesPlans],
    [duesRuns, plan.duesRuns],
    [debts, plan.debts],
    [payments, plan.payments],
    [paymentAllocations, plan.allocations],
    [bankTransactions, plan.bankTransactions],
    [expenses, plan.expenses],
    [staffLedgerEntries, plan.staffLedger],
    [meters, plan.meters],
    [meterReadings, plan.meterReadings],
    [requests, plan.requests],
    [requestComments, plan.requestComments],
    [maintenanceRecords, plan.maintenanceRecords],
    [maintenanceLogs, plan.maintenanceLogs],
    [announcements, plan.announcements],
    [announcementReads, plan.announcementReads],
    [polls, plan.polls],
    [pollVotes, plan.pollVotes],
    [meetings, plan.meetings],
    [meetingAttendances, plan.meetingAttendances],
    [meetingDecisions, plan.meetingDecisions],
    [decisionBookEntries, plan.decisionBook],
    [resources, plan.resources],
    [reservations, plan.reservations],
    [parcels, plan.parcels],
    [visitors, plan.visitors],
    [inventoryItems, plan.inventory],
    [lawyers, plan.lawyers],
    [legalCases, plan.legalCases],
    [legalCaseEvents, plan.legalCaseEvents],
    [debtCertificates, plan.certificates],
    [accessRequests, plan.accessRequests],
    [kvkkRequests, plan.kvkkRequests],
    [notifications, plan.notifications],
  ];
  for (const [table, rows] of steps) {
    for (let i = 0; i < rows.length; i += 300) {
      await tx.insert(table).values(rows.slice(i, i + 300) as never);
    }
  }
}
