import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  BlockRow,
  UnitBulkPatch,
  UnitCreate,
  UnitListQuery,
  UnitListResponse,
  UnitOptionRow,
  UnitRow,
} from "@yonetim/contracts";
import { toPageMeta } from "@yonetim/contracts";
import {
  blocks,
  debts,
  documents,
  meters,
  payments,
  unitOccupancies,
  unitOrder,
  units,
  users,
} from "@yonetim/db";
import { resolveLandShare } from "@yonetim/dues";

import { DbService } from "../../infra/db/db.service";
import type { Database } from "./types";
import { assertUnitQuota } from "./unit-quota";

/**
 * Birim repository — **SQL yalnız burada** (MIMARI-PLAN §8.5).
 *
 * Diğer 40+ modül bu şablonu kopyalar: controller HTTP ve yetki, service iş
 * akışı ve KVKK kaydı, repository SQL.
 *
 * Sıralama anahtarları beyaz listeye bağlı: URL'den gelen değer asla doğrudan
 * SQL'e girmez, yalnız bu haritadaki sütuna çevrilir.
 */
/** Ham SQL parçalarında kullanılacak nitelenmiş sütun referansı. */
const METER_ID = sql.raw('"meters"."id"');

/**
 * `number` bilerek listede yok: daire numarası tek bir sütuna indirgenemiyor
 * (blok + doğal sıra), `unitOrder()` ile ayrıca kuruluyor.
 */
const SORT_COLUMNS = {
  floor: units.floor,
  area: units.areaM2,
  landShare: units.landShare,
  type: units.type,
  createdAt: units.createdAt,
} as const;

@Injectable()
export class UnitRepository {
  constructor(private readonly db: DbService) {}

  /* ---------------------------------------------------------------- *
   * Liste — §9a: liste + facet + toplam TEK turda
   * ---------------------------------------------------------------- */

  async list(q: UnitListQuery): Promise<UnitListResponse> {
    return this.db.tx(async (tx) => {
      const where = this.listWhere(q);

      /*
       * Varsayılan sıra **blok → daire**, ve daire doğal sırada: kullanıcı
       * "A Blok 1, 2, 3 … B Blok 1, 2, 3" bekliyor. Metin sırası bunu
       * `1, 10, 11, … 2, 20` yapıyordu (`unitOrder()` yorumuna bakın).
       *
       * Başka bir sütuna göre sıralandığında (kat, alan) blok/daire sırası
       * **eşitlik bozucu** olarak arkada duruyor: aynı kattaki daireler yine
       * kendi içinde düzgün sıralı geliyor. Ters sıra yalnız seçilen sütuna
       * uygulanıyor — "kata göre azalan" isteyen biri dairelerin de tersten
       * gelmesini istemiyor.
       */
      const orderColumn = SORT_COLUMNS[q.sort as keyof typeof SORT_COLUMNS];
      const orderBy = orderColumn
        ? [q.dir === "desc" ? desc(orderColumn) : asc(orderColumn), ...unitOrder()]
        : unitOrder(q.dir);

      // Ekran bugün 5 ayrı sorgu yapıyor; burada hepsi tek transaction ve
      // tek turda. Panel tarafında karşılığı tek HTTP çağrısı (§9.2a).
      const [rows, total, blockRows, blockCounts, aggregate, trashed] =
        await Promise.all([
          tx
            .select(this.rowProjection())
            .from(units)
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(where)
            .orderBy(...orderBy, asc(units.id))
            .limit(q.perPage)
            .offset((q.page - 1) * q.perPage),

          tx
            .select({ value: sql<number>`COUNT(*)` })
            .from(units)
            .leftJoin(blocks, eq(blocks.id, units.blockId))
            .where(where),

          tx
            .select({ id: blocks.id, name: blocks.name })
            .from(blocks)
            .where(isNull(blocks.deletedAt))
            .orderBy(asc(blocks.sortOrder), asc(blocks.name)),

          /**
           * Blok başına birim sayısı **ayrı gruplu sorgu** olarak alınıyor,
           * blok listesinin içine gömülü bir alt sorgu olarak değil.
           *
           * Nedeni ince ama önemli: Drizzle, tek tablolu bir sorguda sütun
           * referanslarını niteliksiz üretiyor (`"id"`). Ham SQL parçasının
           * içindeki alt sorguda bu ad alt sorgunun kendi tablosuna bağlanır
           * (`units u` → `u.id`) ve koşul sessizce her zaman yanlış olur — hata
           * vermez, yalnız hep 0 döner. Gruplu sorgu bu tuzağa hiç girmiyor.
           */
          tx
            .select({ blockId: units.blockId, value: sql<number>`COUNT(*)` })
            .from(units)
            .where(isNull(units.deletedAt))
            .groupBy(units.blockId),

          // Toplamlar filtreden bağımsız: arsa payı uyarısı tüm siteyi kapsamalı.
          tx
            .select({
              landShareTotal: sql<number>`COALESCE(SUM(${units.landShare}), 0)`,
              areaTotal: sql<number>`COALESCE(SUM(${units.areaM2}), 0)`,
              unitTotal: sql<number>`COUNT(*)`,
            })
            .from(units)
            .where(isNull(units.deletedAt)),

          tx
            .select({ value: sql<number>`COUNT(*)` })
            .from(units)
            .where(isNotNull(units.deletedAt)),
        ]);

      return {
        rows: rows.map(toUnitRow),
        meta: toPageMeta(q.page, q.perPage, Number(total[0]?.value ?? 0)),
        facets: {
          blocks: blockRows.map((b) => ({
            id: b.id,
            label: b.name,
            count: Number(
              blockCounts.find((c) => c.blockId === b.id)?.value ?? 0,
            ),
          })),
          trashedCount: Number(trashed[0]?.value ?? 0),
        },
        totals: {
          unitTotal: Number(aggregate[0]?.unitTotal ?? 0),
          landShareTotal: Number(aggregate[0]?.landShareTotal ?? 0),
          areaTotal: Number(aggregate[0]?.areaTotal ?? 0),
        },
      };
    });
  }

  private listWhere(q: UnitListQuery): SQL | undefined {
    const conditions: SQL[] = [
      q.trashed ? isNotNull(units.deletedAt) : isNull(units.deletedAt),
    ];

    if (q.search) {
      const needle = `%${q.search}%`;
      // Numara veya blok adında arama; trigram indeksi numarayı hızlandırıyor.
      const search = or(
        ilike(units.number, needle),
        ilike(blocks.name, needle),
      );
      if (search) conditions.push(search);
    }
    if (q.blockId) conditions.push(eq(units.blockId, q.blockId));
    if (q.type) conditions.push(sql`${units.type}::text = ${q.type}`);
    if (q.status === "muaf") conditions.push(eq(units.duesExempt, true));
    if (q.status === "bos")
      conditions.push(sql`${units.ownershipType}::text = 'vacant'`);
    if (q.status === "borclu") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM debts d WHERE d.unit_id = ${units.id}
              AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off'))`,
      );
    }
    return and(...conditions);
  }

  private rowProjection() {
    return {
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
      ownerPaysDues: units.ownerPaysDues,
      duesMultiplier: units.duesMultiplier,
      blockId: units.blockId,
      blockName: blocks.name,
      deletedAt: units.deletedAt,
      outstandingMinor: sql<number>`COALESCE((
        SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)
        FROM debts d
        WHERE d.unit_id = ${units.id} AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off')
      ), 0)`,
      occupantCount: sql<number>`(
        SELECT COUNT(*) FROM unit_occupancies o
        WHERE o.unit_id = ${units.id} AND o.end_date IS NULL
      )`,
    };
  }

  /* ---------------------------------------------------------------- *
   * Detay — sekmeli ekranın tüm sekmeleri tek turda (§9.2a `?include=`)
   * ---------------------------------------------------------------- */

  async detail(unitId: string) {
    const data = await this.db.tx(async (tx) => {
      const [unit] = await tx
        .select(this.rowProjection())
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(eq(units.id, unitId))
        .limit(1);
      if (!unit) return null;

      const [raw] = await tx
        .select()
        .from(units)
        .where(eq(units.id, unitId))
        .limit(1);

      const [
        occupancyRows,
        debtAggregate,
        paidAggregate,
        recentDebts,
        recentPayments,
        meterRows,
        documentRows,
      ] = await Promise.all([
        tx
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
          .orderBy(desc(unitOccupancies.startDate)),

        tx
          .select({
            outstanding: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} NOT IN ('paid','written_off')
                THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
            overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.status} NOT IN ('paid','written_off') AND ${debts.dueDate} < now()
                THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)`,
            openCount: sql<number>`COUNT(*) FILTER (WHERE ${debts.status} NOT IN ('paid','written_off'))`,
          })
          .from(debts)
          .where(and(eq(debts.unitId, unitId), isNull(debts.deletedAt))),

        tx
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
          ),

        tx
          .select({
            id: debts.id,
            description: debts.description,
            kind: debts.kind,
            period: debts.period,
            amountMinor: debts.amountKurus,
            paidMinor: debts.paidKurus,
            lateFeeMinor: debts.lateFeeKurus,
            dueDate: debts.dueDate,
            status: debts.status,
          })
          .from(debts)
          .where(and(eq(debts.unitId, unitId), isNull(debts.deletedAt)))
          .orderBy(desc(debts.dueDate))
          .limit(20),

        tx
          .select({
            id: payments.id,
            amountMinor: payments.amountKurus,
            method: payments.method,
            status: payments.status,
            processor: payments.processor,
            paidAt: payments.paidAt,
            receiptNo: payments.receiptNo,
          })
          .from(payments)
          .where(eq(payments.unitId, unitId))
          .orderBy(desc(payments.createdAt))
          .limit(20),

        tx
          .select({
            id: meters.id,
            type: meters.type,
            serialNo: meters.serialNo,
            // Nitelenmiş referans zorunlu: bu sorgunun tek tablosu olduğu için
            // Drizzle `${meters.id}`'yi `"id"` olarak üretir ve alt sorgudaki
            // `meter_readings.id`'ye bağlanır — hata vermeden hep NULL döner.
            // Bkz. facet sayımındaki aynı tuzak.
            lastReading: sql<string | null>`(
                SELECT r.current_value FROM meter_readings r WHERE r.meter_id = ${METER_ID}
                ORDER BY r.reading_date DESC LIMIT 1
              )`,
            lastReadAt: sql<Date | null>`(
                SELECT r.reading_date FROM meter_readings r WHERE r.meter_id = ${METER_ID}
                ORDER BY r.reading_date DESC LIMIT 1
              )`,
          })
          .from(meters)
          .where(and(eq(meters.unitId, unitId), isNull(meters.deletedAt))),

        tx
          .select({
            id: documents.id,
            title: documents.title,
            category: documents.category,
            createdAt: documents.createdAt,
          })
          .from(documents)
          // `documents` polimorfik bağlanır (ownerType/ownerId).
          .where(
            and(
              eq(documents.ownerType, "unit"),
              eq(documents.ownerId, unitId),
              isNull(documents.deletedAt),
            ),
          )
          .orderBy(desc(documents.createdAt))
          .limit(20),
      ]);

      return {
        // `rowProjection()`'daki iki alan SQL toplama fonksiyonundan geliyor:
        // `COUNT(*)` bigint, `SUM(...)` numeric döner ve pg sürücüsü ikisini de
        // **string** olarak verir (bigint JS sayısına sığmayabileceği için).
        // `list()` bunu `toUnitRow` ile düzeltiyordu; `detail()` ham satırı
        // olduğu gibi döndürüyordu ve `unitDetail` sözleşmesi
        // `occupantCount: z.number()` beklediği için birim detay/düzenle uçları
        // ZodError ile patlıyordu. Normalizasyon artık iki yolda da aynı.
        unit: toUnitRow(unit),
        raw: raw!,
        occupancyRows,
        debtSummary: {
          outstandingMinor: Number(debtAggregate[0]?.outstanding ?? 0),
          overdueMinor: Number(debtAggregate[0]?.overdue ?? 0),
          paidThisYearMinor: Number(paidAggregate[0]?.total ?? 0),
          openCount: Number(debtAggregate[0]?.openCount ?? 0),
        },
        recentDebts,
        recentPayments,
        meters: meterRows,
        documents: documentRows,
      };
    });

    if (!data) return null;

    // Kişi bilgileri global `users` tablosunda (RLS kapsamı dışında); kontrollü
    // bypass ile ve yalnız bu birimdeki kişiler için okunuyor.
    const userIds = [...new Set(data.occupancyRows.map((row) => row.userId))];
    const people =
      userIds.length > 0
        ? await this.db.bypass("units:detail-occupants", async (tx) =>
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

    return { ...data, people, userIds };
  }

  /* ---------------------------------------------------------------- *
   * Yazma
   * ---------------------------------------------------------------- */

  async create(dto: UnitCreate): Promise<{ id: string }> {
    const share = resolveLandShare({
      landShare: dto.landShare ?? undefined,
      numerator: dto.landShareNumerator ?? undefined,
      denominator: dto.landShareDenominator ?? undefined,
    });

    return this.db.tx(async (tx) => {
      await assertNumberAvailable(tx, dto.blockId ?? null, dto.number, null);
      const ctx = this.db.ctx();
      await assertUnitQuota(tx, ctx.tenantId, 1);
      const [row] = await tx
        .insert(units)
        .values({
          tenantId: ctx.tenantId,
          ...toColumns(dto, share),
        })
        .returning({ id: units.id });
      if (!row) throw new ConflictException("conflict");
      await refreshBlockCount(tx, dto.blockId ?? null);
      return row;
    });
  }

  /** Güncelleme her zaman gerekçeli — GAP-DURUM kararı 9 (§8.2). */
  async update(id: string, dto: UnitCreate, reason: string) {
    const share = resolveLandShare({
      landShare: dto.landShare ?? undefined,
      numerator: dto.landShareNumerator ?? undefined,
      denominator: dto.landShareDenominator ?? undefined,
    });

    return this.db.txWithReason(reason, async (tx) => {
      const [before] = await tx
        .select()
        .from(units)
        .where(eq(units.id, id))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await assertNumberAvailable(tx, dto.blockId ?? null, dto.number, id);

      const patch = toColumns(dto, share);
      await tx.update(units).set(patch).where(eq(units.id, id));

      // Blok değiştiyse iki bloğun da sayacı tazelenir.
      if (before.blockId !== patch.blockId) {
        await refreshBlockCount(tx, before.blockId);
        await refreshBlockCount(tx, patch.blockId);
      }
      return { before: before as unknown as Record<string, unknown>, patch };
    });
  }

  async softDelete(ids: string[]): Promise<number> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .update(units)
        .set({ deletedAt: new Date() })
        .where(and(inArray(units.id, ids), isNull(units.deletedAt)))
        .returning({ id: units.id, blockId: units.blockId });
      for (const blockId of new Set(rows.map((r) => r.blockId))) {
        await refreshBlockCount(tx, blockId);
      }
      return rows.length;
    });
  }

  async restore(ids: string[]): Promise<number> {
    return this.db.tx(async (tx) => {
      // Geri yüklenen daire de sayıyı artırıyor: paket sınırı burada da geçerli.
      const deleted = await tx
        .select({ id: units.id })
        .from(units)
        .where(and(inArray(units.id, ids), isNotNull(units.deletedAt)));
      await assertUnitQuota(tx, this.db.ctx().tenantId, deleted.length);
      const rows = await tx
        .update(units)
        .set({ deletedAt: null })
        .where(inArray(units.id, ids))
        .returning({ id: units.id, blockId: units.blockId });
      for (const blockId of new Set(rows.map((r) => r.blockId))) {
        await refreshBlockCount(tx, blockId);
      }
      return rows.length;
    });
  }

  async bulkPatch(dto: UnitBulkPatch, reason: string): Promise<number> {
    return this.db.txWithReason(reason, async (tx) => {
      const patch: Record<string, unknown> = {};
      if (dto.duesExempt !== undefined) patch.duesExempt = dto.duesExempt;
      if (dto.lateFeeExempt !== undefined)
        patch.lateFeeExempt = dto.lateFeeExempt;
      if (dto.blockId !== undefined) patch.blockId = dto.blockId;
      if (dto.multiplierFactor !== undefined) {
        // Çarpan SQL içinde çarpılır: okuma-yazma yarışını önler, tek turda biter.
        patch.duesMultiplier = sql`LEAST(9.999, GREATEST(0, ${units.duesMultiplier} * ${dto.multiplierFactor}))`;
      }
      if (Object.keys(patch).length === 0) return 0;

      const rows = await tx
        .update(units)
        .set(patch)
        .where(and(inArray(units.id, dto.ids), isNull(units.deletedAt)))
        .returning({ id: units.id });
      return rows.length;
    });
  }

  /* ---------------------------------------------------------------- *
   * Seçim listeleri
   * ---------------------------------------------------------------- */

  async options(): Promise<UnitOptionRow[]> {
    return this.db.tx(async (tx) =>
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
        .orderBy(...unitOrder()),
    );
  }

  async blockOptions(): Promise<BlockRow[]> {
    return this.db.tx(async (tx) =>
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
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

type LandShare = ReturnType<typeof resolveLandShare>;

function toColumns(dto: UnitCreate, share: LandShare) {
  return {
    blockId: dto.blockId ?? null,
    number: dto.number,
    floor: dto.floor,
    type: dto.type,
    areaM2: dto.areaM2 != null ? dto.areaM2.toFixed(2) : null,
    landShare: share.landShare,
    landShareNumerator: share.numerator,
    landShareDenominator: share.denominator,
    roomCount: dto.roomCount ?? null,
    residentCount: dto.residentCount,
    ownershipType: dto.ownershipType,
    duesExempt: dto.duesExempt,
    lateFeeExempt: dto.lateFeeExempt,
    ownerPaysDues: dto.ownerPaysDues,
    duesMultiplier: (dto.duesMultiplier ?? 1).toFixed(3),
    notes: dto.notes ?? null,
  };
}

function toUnitRow(row: {
  outstandingMinor: number;
  occupantCount: number;
  [k: string]: unknown;
}): UnitRow {
  return {
    ...row,
    outstandingMinor: Number(row.outstandingMinor),
    occupantCount: Number(row.occupantCount),
  } as UnitRow;
}

/**
 * Aynı blokta aynı numara olamaz. Veritabanında unique index zaten var; buradaki
 * kontrol alan bazlı anlaşılır hata verebilmek için — yalnız index'e güvenmek
 * "duplicate key value violates constraint" mesajı üretirdi.
 */
export async function assertNumberAvailable(
  tx: Database,
  blockId: string | null,
  number: string,
  excludeId: string | null,
): Promise<void> {
  const rows = await tx
    .select({ id: units.id })
    .from(units)
    .where(
      and(
        blockId === null ? isNull(units.blockId) : eq(units.blockId, blockId),
        eq(units.number, number),
        isNull(units.deletedAt),
      ),
    );
  if (rows.some((row) => row.id !== excludeId)) {
    throw new ConflictException(`conflict:number_taken:${number}`);
  }
}

/** `blocks.unit_count` denormalize sayacını tazeler. */
export async function refreshBlockCount(
  tx: Database,
  blockId: string | null,
): Promise<void> {
  if (!blockId) return;
  await tx
    .update(blocks)
    .set({
      unitCount: sql`(SELECT COUNT(*) FROM units u WHERE u.block_id = ${blockId} AND u.deleted_at IS NULL)`,
    })
    .where(eq(blocks.id, blockId));
}
