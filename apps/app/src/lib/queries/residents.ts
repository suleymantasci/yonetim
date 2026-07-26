import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import {
  blocks, consents, debts, memberships, payments, unitOccupancies, units, users,
  withBypassRls, withTenant,
} from "@yonetim/db";

import type { AppContext } from "../context";
import type { ListParams } from "../list-params";

/**
 * Sakin sorguları — GAP 4.1.2.
 *
 * MİMARİ ZORLUK: kişi verisi `users` tablosunda ve RLS kapsamı dışında;
 * ilişki verisi (`memberships`, `unit_occupancies`) tenant kapsamında.
 * Bu yüzden sorgu iki aşamalı: önce tenant içinden **kimlik listesi**
 * çıkarılır, sonra yalnız o kimlikler için kontrollü bypass ile kişi
 * bilgisi çekilir. Bypass hiçbir zaman "tüm kullanıcıları getir" biçiminde
 * kullanılmaz — GAP 4.2.7'nin işaret ettiği sorun tam buydu.
 *
 * Not: mevcut kodda `residents/page.tsx` filtresiz `users` sorgusu yapıyordu;
 * bu dosya onun yerini alıyor.
 */

export interface ResidentListRow {
  userId: string;
  firstName: string | null;
  lastName: string | null
  phone: string | null;
  email: string | null;
  whatsappOptIn: boolean;
  hasTckn: boolean;
  roles: string[];
  /** Bu kişinin bu sitedeki aktif ilişkileri (birden fazla olabilir). */
  occupancies: { unitId: string; unitNumber: string; blockName: string | null; relation: string }[];
  /** Tek cari: tüm birimlerdeki toplam bakiye. */
  outstandingKurus: number;
  overdueKurus: number;
}

export interface ResidentListResult {
  rows: ResidentListRow[];
  total: number;
  blocks: { id: string; name: string }[];
  activeCount: number;
  ownerCount: number;
  tenantCount: number;
  optInCount: number;
}

const SORT_KEYS = ["name", "outstanding", "unit"] as const;
export const RESIDENT_SORT_KEYS = SORT_KEYS;

export async function listResidents(
  ctx: AppContext,
  params: ListParams,
): Promise<ResidentListResult> {
  // 1) Tenant kapsamında: kimler var, hangi birimlerde, ne kadar borçlu.
  const scoped = await withTenant(ctx.tenantId, async (tx) => {
    const conditions: SQL[] = [isNull(memberships.deletedAt)];
    if (params.filters.rol) {
      conditions.push(sql`${memberships.role}::text = ${params.filters.rol}`);
    }

    const memberRows = await tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(and(...conditions));

    const occupancyRows = await tx
      .select({
        userId: unitOccupancies.userId,
        unitId: unitOccupancies.unitId,
        unitNumber: units.number,
        blockId: units.blockId,
        blockName: blocks.name,
        relation: unitOccupancies.relation,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(and(isNull(unitOccupancies.endDate), isNull(units.deletedAt)));

    const balanceRows = await tx
      .select({
        userId: debts.debtorUserId,
        outstanding: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.dueDate} < now()
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
      })
      .from(debts)
      .where(and(isNull(debts.deletedAt), sql`${debts.status} <> 'paid'`))
      .groupBy(debts.debtorUserId);

    const blockRows = await tx
      .select({ id: blocks.id, name: blocks.name })
      .from(blocks)
      .where(isNull(blocks.deletedAt))
      .orderBy(asc(blocks.sortOrder), asc(blocks.name));

    return { memberRows, occupancyRows, balanceRows, blockRows };
  });

  const rolesByUser = new Map<string, string[]>();
  for (const row of scoped.memberRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push(row.role);
    rolesByUser.set(row.userId, list);
  }

  const occupanciesByUser = new Map<string, ResidentListRow["occupancies"]>();
  for (const row of scoped.occupancyRows) {
    const list = occupanciesByUser.get(row.userId) ?? [];
    list.push({
      unitId: row.unitId,
      unitNumber: row.unitNumber,
      blockName: row.blockName,
      relation: row.relation,
    });
    occupanciesByUser.set(row.userId, list);
  }

  const balances = new Map(
    scoped.balanceRows
      .filter((row): row is typeof row & { userId: string } => row.userId !== null)
      .map((row) => [row.userId, { outstanding: Number(row.outstanding), overdue: Number(row.overdue) }]),
  );

  // Blok filtresi: kişinin en az bir ilişkisi o blokta olmalı.
  let candidateIds = [...rolesByUser.keys()];
  if (params.filters.blok) {
    const inBlock = new Set(
      scoped.occupancyRows
        .filter((row) => row.blockId === params.filters.blok)
        .map((row) => row.userId),
    );
    candidateIds = candidateIds.filter((id) => inBlock.has(id));
  }
  if (params.filters.durum === "borclu") {
    candidateIds = candidateIds.filter((id) => (balances.get(id)?.outstanding ?? 0) > 0);
  }
  if (params.filters.durum === "coklu") {
    // Birden fazla birimde ilişkisi olanlar — "tek cari" vakalarını görmek için.
    candidateIds = candidateIds.filter((id) => (occupanciesByUser.get(id)?.length ?? 0) > 1);
  }

  if (candidateIds.length === 0) {
    return {
      rows: [],
      total: 0,
      blocks: scoped.blockRows,
      activeCount: 0,
      ownerCount: 0,
      tenantCount: 0,
      optInCount: 0,
    };
  }

  // 2) Yalnız bu kimlikler için kişi bilgisi (gerekçeli bypass).
  const people = await withBypassRls("residents:list-by-membership", async (tx) =>
    tx
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        email: users.email,
        whatsappOptIn: users.whatsappOptIn,
        tcknIndex: users.tcknIndex,
      })
      .from(users)
      .where(and(inArray(users.id, candidateIds), isNull(users.deletedAt))),
  );

  const needle = params.query.toLocaleLowerCase("tr");
  let rows: ResidentListRow[] = people
    .map((person) => {
      const balance = balances.get(person.id);
      return {
        userId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        email: person.email,
        whatsappOptIn: person.whatsappOptIn,
        hasTckn: person.tcknIndex !== null,
        roles: rolesByUser.get(person.id) ?? [],
        occupancies: occupanciesByUser.get(person.id) ?? [],
        outstandingKurus: balance?.outstanding ?? 0,
        overdueKurus: balance?.overdue ?? 0,
      };
    })
    .filter((row) => {
      if (!needle) return true;
      const haystack = [
        row.firstName,
        row.lastName,
        row.phone,
        row.email,
        ...row.occupancies.map((o) => o.unitNumber),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return haystack.includes(needle);
    });

  const compare = (a: ResidentListRow, b: ResidentListRow) => {
    if (params.sort === "outstanding") return b.outstandingKurus - a.outstandingKurus;
    if (params.sort === "unit") {
      return (a.occupancies[0]?.unitNumber ?? "").localeCompare(
        b.occupancies[0]?.unitNumber ?? "",
        "tr",
        { numeric: true },
      );
    }
    return `${a.firstName ?? ""} ${a.lastName ?? ""}`.localeCompare(
      `${b.firstName ?? ""} ${b.lastName ?? ""}`,
      "tr",
    );
  };
  rows.sort(compare);
  if (params.direction === "desc") rows.reverse();

  const total = rows.length;
  const start = (params.page - 1) * params.pageSize;
  rows = rows.slice(start, start + params.pageSize);

  return {
    rows,
    total,
    blocks: scoped.blockRows,
    activeCount: candidateIds.length,
    ownerCount: scoped.occupancyRows.filter((row) => row.relation === "owner").length,
    tenantCount: scoped.occupancyRows.filter((row) => row.relation === "tenant").length,
    optInCount: people.filter((person) => person.whatsappOptIn).length,
  };
}

export interface ResidentDetail {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  whatsappOptIn: boolean;
  whatsappOptInAt: Date | null;
  tcknEncrypted: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  roles: string[];
  notes: string | null;
  occupancies: {
    occupancyId: string;
    unitId: string;
    unitNumber: string;
    blockName: string | null;
    relation: string;
    ownershipPct: string;
    startDate: Date;
    endDate: Date | null;
    debtTransferPolicy: string;
    contractUrl: string | null;
  }[];
  balance: { outstandingKurus: number; overdueKurus: number; paidTotalKurus: number };
  debts: {
    id: string;
    unitNumber: string;
    description: string;
    period: string | null;
    amountKurus: number;
    paidKurus: number;
    lateFeeKurus: number;
    dueDate: Date;
    status: string;
  }[];
  payments: {
    id: string;
    amountKurus: number;
    method: string;
    status: string;
    paidAt: Date | null;
    receiptNo: string | null;
    /** Borçlu başka biriyse ödemenin kimin adına yapıldığı. */
    onBehalfOf: string | null;
  }[];
  consents: { kind: string; granted: boolean; documentVersion: string; at: Date | null }[];
}

export async function getResidentDetail(
  ctx: AppContext,
  userId: string,
): Promise<ResidentDetail | null> {
  const scoped = await withTenant(ctx.tenantId, async (tx) => {
    const memberRows = await tx
      .select({ role: memberships.role, notes: memberships.notes })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt)));
    // Bu sitede üyeliği yoksa detay gösterilmez (yatay yetki sınırı).
    if (memberRows.length === 0) return null;

    const occupancyRows = await tx
      .select({
        occupancyId: unitOccupancies.id,
        unitId: unitOccupancies.unitId,
        unitNumber: units.number,
        blockName: blocks.name,
        relation: unitOccupancies.relation,
        ownershipPct: unitOccupancies.ownershipPct,
        startDate: unitOccupancies.startDate,
        endDate: unitOccupancies.endDate,
        debtTransferPolicy: unitOccupancies.debtTransferPolicy,
        contractUrl: unitOccupancies.contractUrl,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(eq(unitOccupancies.userId, userId))
      .orderBy(desc(unitOccupancies.startDate));

    const [balanceRow] = await tx
      .select({
        outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid'
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid' AND ${debts.dueDate} < now()
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
      })
      .from(debts)
      .where(and(eq(debts.debtorUserId, userId), isNull(debts.deletedAt)));

    const [paidRow] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)` })
      .from(payments)
      .where(and(eq(payments.payerUserId, userId), eq(payments.status, "completed")));

    const debtRows = await tx
      .select({
        id: debts.id,
        unitNumber: units.number,
        description: debts.description,
        period: debts.period,
        amountKurus: debts.amountKurus,
        paidKurus: debts.paidKurus,
        lateFeeKurus: debts.lateFeeKurus,
        dueDate: debts.dueDate,
        status: debts.status,
      })
      .from(debts)
      .innerJoin(units, eq(units.id, debts.unitId))
      .where(and(eq(debts.debtorUserId, userId), isNull(debts.deletedAt)))
      .orderBy(desc(debts.dueDate))
      .limit(50);

    const paymentRows = await tx
      .select({
        id: payments.id,
        amountKurus: payments.amountKurus,
        method: payments.method,
        status: payments.status,
        paidAt: payments.paidAt,
        receiptNo: payments.receiptNo,
        debtorUserId: payments.debtorUserId,
      })
      .from(payments)
      .where(eq(payments.payerUserId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(50);

    return { memberRows, occupancyRows, balanceRow, paidRow, debtRows, paymentRows };
  });

  if (!scoped) return null;

  const [person] = await withBypassRls("residents:detail", async (tx) =>
    tx
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        email: users.email,
        locale: users.locale,
        whatsappOptIn: users.whatsappOptIn,
        whatsappOptInAt: users.whatsappOptInAt,
        tcknEncrypted: users.tcknEncrypted,
        emergencyContactName: users.emergencyContactName,
        emergencyContactPhone: users.emergencyContactPhone,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  );
  if (!person) return null;

  const consentRows = await withBypassRls("residents:consents", async (tx) =>
    tx
      .select({
        kind: consents.kind,
        granted: consents.granted,
        documentVersion: consents.documentVersion,
        grantedAt: consents.grantedAt,
        revokedAt: consents.revokedAt,
        createdAt: consents.createdAt,
      })
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.tenantId, ctx.tenantId)))
      .orderBy(desc(consents.createdAt))
      .limit(20),
  );

  // Ödemenin başkası adına yapılıp yapılmadığını göstermek için borçlu adı.
  const otherDebtorIds = [
    ...new Set(
      scoped.paymentRows
        .map((row) => row.debtorUserId)
        .filter((id): id is string => id !== null && id !== userId),
    ),
  ];
  const otherDebtors =
    otherDebtorIds.length > 0
      ? await withBypassRls("residents:payment-debtors", async (tx) =>
          tx
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, otherDebtorIds)),
        )
      : [];

  return {
    userId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    phone: person.phone,
    email: person.email,
    locale: person.locale,
    whatsappOptIn: person.whatsappOptIn,
    whatsappOptInAt: person.whatsappOptInAt,
    tcknEncrypted: person.tcknEncrypted,
    emergencyContactName: person.emergencyContactName,
    emergencyContactPhone: person.emergencyContactPhone,
    createdAt: person.createdAt,
    lastLoginAt: person.lastLoginAt,
    roles: scoped.memberRows.map((row) => row.role),
    notes: scoped.memberRows.find((row) => row.notes)?.notes ?? null,
    occupancies: scoped.occupancyRows,
    balance: {
      outstandingKurus: Number(scoped.balanceRow?.outstanding ?? 0),
      overdueKurus: Number(scoped.balanceRow?.overdue ?? 0),
      paidTotalKurus: Number(scoped.paidRow?.total ?? 0),
    },
    debts: scoped.debtRows,
    payments: scoped.paymentRows.map((row) => {
      const other =
        row.debtorUserId && row.debtorUserId !== userId
          ? otherDebtors.find((d) => d.id === row.debtorUserId)
          : undefined;
      return {
        id: row.id,
        amountKurus: row.amountKurus,
        method: row.method,
        status: row.status,
        paidAt: row.paidAt,
        receiptNo: row.receiptNo,
        onBehalfOf: other
          ? [other.firstName, other.lastName].filter(Boolean).join(" ")
          : null,
      };
    }),
    consents: consentRows.map((row) => ({
      kind: row.kind,
      granted: row.granted,
      documentVersion: row.documentVersion,
      at: row.grantedAt ?? row.revokedAt ?? row.createdAt,
    })),
  };
}

/** Combobox için sakin listesi (borç/ödeme ekranlarında). */
export async function getResidentOptions(ctx: AppContext) {
  const ids = await withTenant(ctx.tenantId, async (tx) =>
    (
      await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(isNull(memberships.deletedAt))
    ).map((row) => row.userId),
  );
  if (ids.length === 0) return [];

  return withBypassRls("residents:options", async (tx) =>
    tx
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
      })
      .from(users)
      .where(and(inArray(users.id, [...new Set(ids)]), isNull(users.deletedAt)))
      .orderBy(asc(users.firstName), asc(users.lastName)),
  );
}
