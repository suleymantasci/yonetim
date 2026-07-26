import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import {
  blocks, debtChanges, debts, duesPlans, paymentAllocations, payments, units, users,
  withBypassRls, withTenant,
} from "@yonetim/db";

import type { AppContext } from "../context";
import type { ListParams } from "../list-params";

/**
 * Borç sorguları — liste, detay ve **değişiklik tarihçesi** (SPEC 3.2).
 */
const SORT_COLUMNS = {
  dueDate: debts.dueDate,
  amount: debts.amountKurus,
  unit: units.number,
  period: debts.period,
  status: debts.status,
  createdAt: debts.createdAt,
} as const;

export const DEBT_SORT_KEYS = Object.keys(SORT_COLUMNS) as (keyof typeof SORT_COLUMNS)[];

export interface DebtListRow {
  id: string;
  unitId: string;
  unitNumber: string;
  blockName: string | null;
  debtorUserId: string | null;
  debtorName: string | null;
  kind: string;
  description: string;
  period: string | null;
  amountKurus: number;
  paidKurus: number;
  lateFeeKurus: number;
  outstandingKurus: number;
  dueDate: Date;
  status: string;
  lateFeeExempt: boolean;
  installmentNo: number | null;
  installmentCount: number | null;
  /** Bu borcun değişiklik kaydı var mı — listede şeffaflık işareti. */
  changeCount: number;
}

export interface DebtListResult {
  rows: DebtListRow[];
  total: number;
  blocks: { id: string; name: string }[];
  periods: string[];
  totals: {
    outstandingKurus: number;
    overdueKurus: number;
    lateFeeKurus: number;
    collectedKurus: number;
  };
}

export async function listDebts(ctx: AppContext, params: ListParams): Promise<DebtListResult> {
  const scoped = await withTenant(ctx.tenantId, async (tx) => {
    const conditions: SQL[] = [isNull(debts.deletedAt)];

    if (params.query) {
      const needle = `%${params.query}%`;
      const search = or(
        ilike(units.number, needle),
        ilike(debts.description, needle),
        ilike(blocks.name, needle),
      );
      if (search) conditions.push(search);
    }
    if (params.filters.blok) conditions.push(eq(units.blockId, params.filters.blok));
    if (params.filters.donem) conditions.push(eq(debts.period, params.filters.donem));
    if (params.filters.tur) conditions.push(sql`${debts.kind}::text = ${params.filters.tur}`);
    if (params.filters.durum === "acik") conditions.push(sql`${debts.status} <> 'paid'`);
    if (params.filters.durum === "gecikmis") {
      conditions.push(sql`${debts.status} <> 'paid' AND ${debts.dueDate} < now()`);
    }
    if (params.filters.durum === "odendi") conditions.push(eq(debts.status, "paid"));
    if (params.filters.durum === "taksit") conditions.push(sql`${debts.installmentCount} IS NOT NULL`);

    const where = and(...conditions);
    const orderColumn = SORT_COLUMNS[params.sort as keyof typeof SORT_COLUMNS] ?? debts.dueDate;
    const orderBy = params.direction === "asc" ? asc(orderColumn) : desc(orderColumn);

    const rows = await tx
      .select({
        id: debts.id,
        unitId: debts.unitId,
        unitNumber: units.number,
        blockName: blocks.name,
        debtorUserId: debts.debtorUserId,
        kind: debts.kind,
        description: debts.description,
        period: debts.period,
        amountKurus: debts.amountKurus,
        paidKurus: debts.paidKurus,
        lateFeeKurus: debts.lateFeeKurus,
        dueDate: debts.dueDate,
        status: debts.status,
        lateFeeExempt: debts.lateFeeExempt,
        installmentNo: debts.installmentNo,
        installmentCount: debts.installmentCount,
        changeCount: sql<number>`(
          SELECT COUNT(*) FROM audit_debt_changes c WHERE c.debt_id = ${debts.id}
        )`,
      })
      .from(debts)
      .innerJoin(units, eq(units.id, debts.unitId))
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(where)
      .orderBy(orderBy, asc(debts.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const [totalRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(debts)
      .innerJoin(units, eq(units.id, debts.unitId))
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(where);

    const blockRows = await tx
      .select({ id: blocks.id, name: blocks.name })
      .from(blocks)
      .where(isNull(blocks.deletedAt))
      .orderBy(asc(blocks.sortOrder), asc(blocks.name));

    const periodRows = await tx
      .selectDistinct({ period: debts.period })
      .from(debts)
      .where(and(isNull(debts.deletedAt), sql`${debts.period} IS NOT NULL`))
      .orderBy(desc(debts.period))
      .limit(24);

    // Özet toplamlar filtreden bağımsız: yöneticinin genel durumu görmesi için.
    const [totals] = await tx
      .select({
        outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid'
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid' AND ${debts.dueDate} < now()
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
        lateFee: sql<number>`COALESCE(SUM(${debts.lateFeeKurus}), 0)`,
        collected: sql<number>`COALESCE(SUM(${debts.paidKurus}), 0)`,
      })
      .from(debts)
      .where(isNull(debts.deletedAt));

    return { rows, total: Number(totalRow?.value ?? 0), blockRows, periodRows, totals };
  });

  // Borçlu adları — yalnız listedeki kişiler için kontrollü bypass.
  const debtorIds = [
    ...new Set(scoped.rows.map((row) => row.debtorUserId).filter((id): id is string => id !== null)),
  ];
  const debtors =
    debtorIds.length > 0
      ? await withBypassRls("debts:list-debtors", async (tx) =>
          tx
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, debtorIds)),
        )
      : [];

  return {
    rows: scoped.rows.map((row) => {
      const debtor = debtors.find((person) => person.id === row.debtorUserId);
      return {
        ...row,
        debtorName: debtor
          ? [debtor.firstName, debtor.lastName].filter(Boolean).join(" ")
          : null,
        outstandingKurus: row.amountKurus + row.lateFeeKurus - row.paidKurus,
        changeCount: Number(row.changeCount),
      };
    }),
    total: scoped.total,
    blocks: scoped.blockRows,
    periods: scoped.periodRows
      .map((row) => row.period)
      .filter((period): period is string => period !== null),
    totals: {
      outstandingKurus: Number(scoped.totals?.outstanding ?? 0),
      overdueKurus: Number(scoped.totals?.overdue ?? 0),
      lateFeeKurus: Number(scoped.totals?.lateFee ?? 0),
      collectedKurus: Number(scoped.totals?.collected ?? 0),
    },
  };
}

export interface DebtChangeEntry {
  id: string;
  changeType: string;
  oldAmountKurus: number | null;
  newAmountKurus: number | null;
  oldDueDate: Date | null;
  newDueDate: Date | null;
  changedByName: string | null;
  reason: string | null;
  visibleToResident: boolean;
  createdAt: Date;
}

export interface DebtDetail {
  debt: typeof debts.$inferSelect;
  unit: { id: string; number: string; blockName: string | null };
  debtorName: string | null;
  planName: string | null;
  /** VURUCU: değişiklik tarihçesi (append-only tablodan). */
  changes: DebtChangeEntry[];
  allocations: {
    paymentId: string;
    amountKurus: number;
    paidAt: Date | null;
    method: string;
    receiptNo: string | null;
    payerName: string | null;
  }[];
  /** Aynı taksit planındaki kardeş borçlar. */
  siblings: {
    id: string;
    installmentNo: number | null;
    amountKurus: number;
    paidKurus: number;
    dueDate: Date;
    status: string;
  }[];
}

export async function getDebtDetail(ctx: AppContext, debtId: string): Promise<DebtDetail | null> {
  const scoped = await withTenant(ctx.tenantId, async (tx) => {
    const [debt] = await tx.select().from(debts).where(eq(debts.id, debtId)).limit(1);
    if (!debt) return null;

    const [unit] = await tx
      .select({ id: units.id, number: units.number, blockName: blocks.name })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(eq(units.id, debt.unitId))
      .limit(1);

    const changeRows = await tx
      .select()
      .from(debtChanges)
      .where(eq(debtChanges.debtId, debtId))
      .orderBy(desc(debtChanges.createdAt));

    const allocationRows = await tx
      .select({
        paymentId: payments.id,
        amountKurus: paymentAllocations.amountKurus,
        paidAt: payments.paidAt,
        method: payments.method,
        receiptNo: payments.receiptNo,
        payerUserId: payments.payerUserId,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(paymentAllocations.debtId, debtId))
      .orderBy(desc(payments.paidAt));

    const [plan] = debt.duesPlanId
      ? await tx
          .select({ name: duesPlans.name })
          .from(duesPlans)
          .where(eq(duesPlans.id, debt.duesPlanId))
          .limit(1)
      : [];

    // Taksit kardeşleri: aynı açıklama kökü ve aynı taksit sayısı.
    const siblings =
      debt.installmentCount && debt.installmentCount > 1
        ? await tx
            .select({
              id: debts.id,
              installmentNo: debts.installmentNo,
              amountKurus: debts.amountKurus,
              paidKurus: debts.paidKurus,
              dueDate: debts.dueDate,
              status: debts.status,
            })
            .from(debts)
            .where(
              and(
                eq(debts.unitId, debt.unitId),
                eq(debts.installmentCount, debt.installmentCount),
                isNull(debts.deletedAt),
              ),
            )
            .orderBy(asc(debts.installmentNo))
        : [];

    return { debt, unit, changeRows, allocationRows, planName: plan?.name ?? null, siblings };
  });

  if (!scoped) return null;

  const personIds = [
    ...new Set(
      [
        scoped.debt.debtorUserId,
        ...scoped.changeRows.map((row) => row.changedBy),
        ...scoped.allocationRows.map((row) => row.payerUserId),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const people =
    personIds.length > 0
      ? await withBypassRls("debts:detail-people", async (tx) =>
          tx
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, personIds)),
        )
      : [];

  const nameOf = (id: string | null) => {
    if (!id) return null;
    const person = people.find((entry) => entry.id === id);
    return person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : null;
  };

  return {
    debt: scoped.debt,
    unit: scoped.unit ?? { id: scoped.debt.unitId, number: "—", blockName: null },
    debtorName: nameOf(scoped.debt.debtorUserId),
    planName: scoped.planName,
    changes: scoped.changeRows.map((row) => ({
      id: row.id,
      changeType: row.changeType,
      oldAmountKurus: row.oldAmountKurus,
      newAmountKurus: row.newAmountKurus,
      oldDueDate: row.oldDueDate,
      newDueDate: row.newDueDate,
      changedByName: nameOf(row.changedBy),
      reason: row.reason,
      visibleToResident: row.visibleToResident,
      createdAt: row.createdAt,
    })),
    allocations: scoped.allocationRows.map((row) => ({
      paymentId: row.paymentId,
      amountKurus: row.amountKurus,
      paidAt: row.paidAt,
      method: row.method,
      receiptNo: row.receiptNo,
      payerName: nameOf(row.payerUserId),
    })),
    siblings: scoped.siblings,
  };
}

/**
 * Toplu değişiklik listesi — GAP 5.2 ("tarih, değiştiren, kaç borç etkilendi").
 * Denetim ekranında ve dashboard'da şeffaflık göstergesi olarak kullanılır.
 */
export async function listRecentDebtChanges(ctx: AppContext, limit = 50) {
  const scoped = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: debtChanges.id,
        debtId: debtChanges.debtId,
        unitId: debtChanges.unitId,
        unitNumber: units.number,
        changeType: debtChanges.changeType,
        oldAmountKurus: debtChanges.oldAmountKurus,
        newAmountKurus: debtChanges.newAmountKurus,
        changedBy: debtChanges.changedBy,
        reason: debtChanges.reason,
        createdAt: debtChanges.createdAt,
      })
      .from(debtChanges)
      .leftJoin(units, eq(units.id, debtChanges.unitId))
      .orderBy(desc(debtChanges.createdAt))
      .limit(limit),
  );

  const actorIds = [
    ...new Set(scoped.map((row) => row.changedBy).filter((id): id is string => id !== null)),
  ];
  const actors =
    actorIds.length > 0
      ? await withBypassRls("debts:change-actors", async (tx) =>
          tx
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, actorIds)),
        )
      : [];

  return scoped.map((row) => {
    const actor = actors.find((entry) => entry.id === row.changedBy);
    return {
      ...row,
      actorName: actor ? [actor.firstName, actor.lastName].filter(Boolean).join(" ") : null,
    };
  });
}

/** Bir birimin açık borçları (tahsilat formu için). */
export async function getOpenDebtsForUnit(ctx: AppContext, unitId: string) {
  return withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: debts.id,
        description: debts.description,
        period: debts.period,
        amountKurus: debts.amountKurus,
        paidKurus: debts.paidKurus,
        lateFeeKurus: debts.lateFeeKurus,
        dueDate: debts.dueDate,
      })
      .from(debts)
      .where(
        and(eq(debts.unitId, unitId), isNull(debts.deletedAt), sql`${debts.status} <> 'paid'`),
      )
      .orderBy(asc(debts.dueDate)),
  );
}
