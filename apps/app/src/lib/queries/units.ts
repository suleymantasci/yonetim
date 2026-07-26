import {
  and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL,
} from "drizzle-orm";

import {
  blocks, debts, documents, meters, payments, unitOccupancies, units, users,
  withBypassRls, withTenant,
} from "@yonetim/db";

import type { AppContext } from "../context";
import type { ListParams } from "../list-params";

/**
 * Birim sorguları — liste (sayfalı/filtreli) ve detay.
 *
 * Sıralama anahtarları burada **beyaz listeye** bağlanır: URL'den gelen değer
 * asla doğrudan SQL'e girmez, yalnız bu haritadaki sütuna çevrilir.
 */
const SORT_COLUMNS = {
  number: units.number,
  floor: units.floor,
  area: units.areaM2,
  landShare: units.landShare,
  type: units.type,
  createdAt: units.createdAt,
} as const;

export const UNIT_SORT_KEYS = Object.keys(SORT_COLUMNS) as (keyof typeof SORT_COLUMNS)[];

export interface UnitListRow {
  id: string;
  number: string;
  floor: number;
  type: string;
  areaM2: string | null;
  landShare: string | null;
  landShareNumerator: number | null;
  landShareDenominator: number | null;
  ownershipType: string;
  duesExempt: boolean;
  lateFeeExempt: boolean;
  duesMultiplier: string;
  blockId: string | null;
  blockName: string | null;
  deletedAt: Date | null;
  /** Ödenmemiş bakiye (gecikme tazminatı dahil). */
  outstandingKurus: number;
  occupantCount: number;
}

export interface UnitListResult {
  rows: UnitListRow[];
  total: number;
  /** Filtre açılırları için blok listesi. */
  blocks: { id: string; name: string }[];
  /** Arsa payı toplamı tutarlılık uyarısı için (tüm birimler, filtre dışı). */
  landShareTotal: number;
  unitTotal: number;
  areaTotal: number;
  trashedCount: number;
}

export async function listUnits(ctx: AppContext, params: ListParams): Promise<UnitListResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    const conditions: SQL[] = [
      params.trashed ? isNotNull(units.deletedAt) : isNull(units.deletedAt),
    ];

    if (params.query) {
      const needle = `%${params.query}%`;
      // Numara veya blok adında arama; trigram indeksi numarayı hızlandırıyor.
      const search = or(ilike(units.number, needle), ilike(blocks.name, needle));
      if (search) conditions.push(search);
    }
    if (params.filters.blok) conditions.push(eq(units.blockId, params.filters.blok));
    if (params.filters.tip) conditions.push(sql`${units.type}::text = ${params.filters.tip}`);
    if (params.filters.durum === "muaf") conditions.push(eq(units.duesExempt, true));
    if (params.filters.durum === "bos") conditions.push(sql`${units.ownershipType}::text = 'vacant'`);
    if (params.filters.durum === "borclu") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM debts d WHERE d.unit_id = ${units.id}
              AND d.deleted_at IS NULL AND d.status <> 'paid')`,
      );
    }

    const where = and(...conditions);
    const orderColumn = SORT_COLUMNS[params.sort as keyof typeof SORT_COLUMNS] ?? units.number;
    const orderBy = params.direction === "desc" ? desc(orderColumn) : asc(orderColumn);

    const rows = await tx
      .select({
        id: units.id,
        number: units.number,
        floor: units.floor,
        type: units.type,
        areaM2: units.areaM2,
        landShare: units.landShare,
        landShareNumerator: units.landShareNumerator,
        landShareDenominator: units.landShareDenominator,
        ownershipType: units.ownershipType,
        duesExempt: units.duesExempt,
        lateFeeExempt: units.lateFeeExempt,
        duesMultiplier: units.duesMultiplier,
        blockId: units.blockId,
        blockName: blocks.name,
        deletedAt: units.deletedAt,
        outstandingKurus: sql<number>`COALESCE((
          SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)
          FROM debts d
          WHERE d.unit_id = ${units.id} AND d.deleted_at IS NULL AND d.status <> 'paid'
        ), 0)`,
        occupantCount: sql<number>`(
          SELECT COUNT(*) FROM unit_occupancies o
          WHERE o.unit_id = ${units.id} AND o.end_date IS NULL
        )`,
      })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(where)
      .orderBy(orderBy, asc(units.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const [totalRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(where);

    const blockRows = await tx
      .select({ id: blocks.id, name: blocks.name })
      .from(blocks)
      .where(isNull(blocks.deletedAt))
      .orderBy(asc(blocks.sortOrder), asc(blocks.name));

    // Toplamlar filtreden bağımsız: arsa payı uyarısı tüm siteyi kapsamalı.
    const [aggregate] = await tx
      .select({
        landShareTotal: sql<number>`COALESCE(SUM(${units.landShare}), 0)`,
        areaTotal: sql<number>`COALESCE(SUM(${units.areaM2}), 0)`,
        unitTotal: sql<number>`COUNT(*)`,
      })
      .from(units)
      .where(isNull(units.deletedAt));

    const [trashRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(units)
      .where(isNotNull(units.deletedAt));

    return {
      rows: rows.map((row) => ({
        ...row,
        outstandingKurus: Number(row.outstandingKurus),
        occupantCount: Number(row.occupantCount),
      })),
      total: Number(totalRow?.value ?? 0),
      blocks: blockRows,
      landShareTotal: Number(aggregate?.landShareTotal ?? 0),
      areaTotal: Number(aggregate?.areaTotal ?? 0),
      unitTotal: Number(aggregate?.unitTotal ?? 0),
      trashedCount: Number(trashRow?.value ?? 0),
    };
  });
}

export interface UnitOccupant {
  occupancyId: string;
  userId: string;
  relation: string;
  ownershipPct: string;
  startDate: Date;
  endDate: Date | null;
  debtTransferPolicy: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  whatsappOptIn: boolean;
}

export interface UnitDetail {
  unit: typeof units.$inferSelect;
  block: { id: string; name: string } | null;
  occupants: UnitOccupant[];
  debtSummary: {
    outstandingKurus: number;
    overdueKurus: number;
    paidThisYearKurus: number;
    openCount: number;
  };
  recentDebts: {
    id: string;
    description: string;
    kind: string;
    period: string | null;
    amountKurus: number;
    paidKurus: number;
    lateFeeKurus: number;
    dueDate: Date;
    status: string;
  }[];
  recentPayments: {
    id: string;
    amountKurus: number;
    method: string;
    status: string;
    paidAt: Date | null;
    receiptNo: string | null;
  }[];
  meters: {
    id: string;
    type: string;
    serialNo: string | null;
    lastReading: string | null;
    lastReadAt: Date | null;
  }[];
  documents: { id: string; title: string; category: string; createdAt: Date }[];
}

/**
 * Birim detayı — sekmeli ekranın tüm sekmelerini tek turda çeker.
 *
 * Sekme başına ayrı istek atmak (client fetch) daha "modern" görünürdü ama
 * bu veriler küçük ve birlikte anlam taşıyor; tek transaction hem tutarlı
 * bir anlık görüntü verir hem sekme geçişini anında yapar.
 */
export async function getUnitDetail(ctx: AppContext, unitId: string): Promise<UnitDetail | null> {
  const data = await withTenant(ctx.tenantId, async (tx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, unitId)).limit(1);
    if (!unit) return null;

    const [block] = unit.blockId
      ? await tx
          .select({ id: blocks.id, name: blocks.name })
          .from(blocks)
          .where(eq(blocks.id, unit.blockId))
          .limit(1)
      : [];

    const occupancyRows = await tx
      .select({
        occupancyId: unitOccupancies.id,
        userId: unitOccupancies.userId,
        relation: unitOccupancies.relation,
        ownershipPct: unitOccupancies.ownershipPct,
        startDate: unitOccupancies.startDate,
        endDate: unitOccupancies.endDate,
        debtTransferPolicy: unitOccupancies.debtTransferPolicy,
      })
      .from(unitOccupancies)
      .where(eq(unitOccupancies.unitId, unitId))
      .orderBy(desc(unitOccupancies.startDate));

    const [debtAggregate] = await tx
      .select({
        outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid'
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
        overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} <> 'paid' AND ${debts.dueDate} < now()
          THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
        openCount: sql<number>`COUNT(*) FILTER (WHERE ${debts.status} <> 'paid')`,
      })
      .from(debts)
      .where(and(eq(debts.unitId, unitId), isNull(debts.deletedAt)));

    const [paidAggregate] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.unitId, unitId),
          eq(payments.status, "completed"),
          sql`${payments.paidAt} >= date_trunc('year', now())`,
        ),
      );

    const recentDebts = await tx
      .select({
        id: debts.id,
        description: debts.description,
        kind: debts.kind,
        period: debts.period,
        amountKurus: debts.amountKurus,
        paidKurus: debts.paidKurus,
        lateFeeKurus: debts.lateFeeKurus,
        dueDate: debts.dueDate,
        status: debts.status,
      })
      .from(debts)
      .where(and(eq(debts.unitId, unitId), isNull(debts.deletedAt)))
      .orderBy(desc(debts.dueDate))
      .limit(20);

    const recentPayments = await tx
      .select({
        id: payments.id,
        amountKurus: payments.amountKurus,
        method: payments.method,
        status: payments.status,
        paidAt: payments.paidAt,
        receiptNo: payments.receiptNo,
      })
      .from(payments)
      .where(eq(payments.unitId, unitId))
      .orderBy(desc(payments.createdAt))
      .limit(20);

    const meterRows = await tx
      .select({
        id: meters.id,
        type: meters.type,
        serialNo: meters.serialNo,
        lastReading: sql<string | null>`(
          SELECT r.current_value FROM meter_readings r WHERE r.meter_id = ${meters.id}
          ORDER BY r.reading_date DESC LIMIT 1
        )`,
        lastReadAt: sql<Date | null>`(
          SELECT r.reading_date FROM meter_readings r WHERE r.meter_id = ${meters.id}
          ORDER BY r.reading_date DESC LIMIT 1
        )`,
      })
      .from(meters)
      .where(and(eq(meters.unitId, unitId), isNull(meters.deletedAt)));

    const documentRows = await tx
      .select({
        id: documents.id,
        title: documents.title,
        category: documents.category,
        createdAt: documents.createdAt,
      })
      .from(documents)
      // `documents` polimorfik bağlanır (ownerType/ownerId) — birim belgeleri böyle işaretlenir.
      .where(
        and(
          eq(documents.ownerType, "unit"),
          eq(documents.ownerId, unitId),
          isNull(documents.deletedAt),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(20);

    return {
      unit,
      block: block ?? null,
      occupancyRows,
      debtSummary: {
        outstandingKurus: Number(debtAggregate?.outstanding ?? 0),
        overdueKurus: Number(debtAggregate?.overdue ?? 0),
        paidThisYearKurus: Number(paidAggregate?.total ?? 0),
        openCount: Number(debtAggregate?.openCount ?? 0),
      },
      recentDebts,
      recentPayments,
      meters: meterRows,
      documents: documentRows,
    };
  });

  if (!data) return null;

  // Kişi bilgileri global `users` tablosunda; RLS kapsamı dışında olduğu için
  // kontrollü bypass ile ve yalnız bu birimdeki kişiler için okunur.
  const userIds = [...new Set(data.occupancyRows.map((row) => row.userId))];
  const people =
    userIds.length > 0
      ? await withBypassRls("units:detail-occupants", async (tx) =>
          tx
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              phone: users.phone,
              email: users.email,
              whatsappOptIn: users.whatsappOptIn,
            })
            .from(users)
            .where(inArray(users.id, userIds)),
        )
      : [];

  return {
    unit: data.unit,
    block: data.block,
    occupants: data.occupancyRows.map((row) => {
      const person = people.find((p) => p.id === row.userId);
      return {
        ...row,
        firstName: person?.firstName ?? null,
        lastName: person?.lastName ?? null,
        phone: person?.phone ?? null,
        email: person?.email ?? null,
        whatsappOptIn: person?.whatsappOptIn ?? false,
      };
    }),
    debtSummary: data.debtSummary,
    recentDebts: data.recentDebts,
    recentPayments: data.recentPayments,
    meters: data.meters,
    documents: data.documents,
  };
}

/** Form açılırları: blok listesi. */
export async function getBlockOptions(ctx: AppContext) {
  return withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: blocks.id,
        name: blocks.name,
        floorCount: blocks.floorCount,
        unitCount: blocks.unitCount,
        hasElevator: blocks.hasElevator,
        sortOrder: blocks.sortOrder,
      })
      .from(blocks)
      .where(isNull(blocks.deletedAt))
      .orderBy(asc(blocks.sortOrder), asc(blocks.name)),
  );
}

/** Combobox için birim listesi (borç/gider ekranlarında kullanılır). */
export async function getUnitOptions(ctx: AppContext) {
  return withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: units.id,
        number: units.number,
        blockName: blocks.name,
        floor: units.floor,
      })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .where(isNull(units.deletedAt))
      .orderBy(asc(blocks.sortOrder), asc(units.number)),
  );
}
