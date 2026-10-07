import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  blocks,
  maintenanceLogs,
  maintenanceRecords,
  maintenanceTemplates,
  memberships,
  meterReadings,
  meters,
  requestComments,
  requests,
  reservations,
  resources,
  unitNumberOrder,
  unitOrder,
  units,
  users,
} from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

/**
 * Talep atanabilecek roller.
 *
 * Sakin rolleri (`owner`, `tenant_resident`) **yok**: talebi açan sakin
 * olabilir ama çözmekle görevlendirilen yönetim tarafıdır. Sakine atama
 * yapılabilseydi SLA sayacı, yönetimin sorumlu olmadığı bir sürede işlerdi.
 */
const ASSIGNABLE_ROLES = [
  "manager",
  "staff",
  "company_admin",
  "company_operator",
] as const;

/**
 * `operations` okuma sorguları — MIMARI-PLAN §8.5. SQL yalnız burada.
 *
 * Dört liste de üst sınırlı (`limit`): bu ekranlar operasyonun **şu anki**
 * durumunu gösteriyor, arşiv değil. Sınırsız çekmek büyük sitede sayfayı
 * kilitlerdi; geçmişe erişim ilgili kaydın detayından yürüyor.
 */
@Injectable()
export class OperationsRepository {
  constructor(private readonly db: DbService) {}

  async requests(limit = 200) {
    return this.db.tx(async (tx) => {
      const [rows, assignees, unitRows] = await Promise.all([
        tx
          .select()
          .from(requests)
          .where(isNull(requests.deletedAt))
          .orderBy(desc(requests.createdAt))
          .limit(limit),

        // Atama ve daire seçenekleri aynı turda geliyor: ekran "liste + iki
        // form" ve seçenekleri ayrı uçtan çekmek üç gidiş-dönüş demekti (§9a).
        tx
          .selectDistinctOn([users.id], {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            role: memberships.role,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              isNull(memberships.deletedAt),
              isNull(users.deletedAt),
              inArray(memberships.role, [...ASSIGNABLE_ROLES]),
            ),
          )
          .orderBy(asc(users.id)),

        tx
          .select({
            id: units.id,
            number: units.number,
            blockName: blocks.name,
          })
          .from(units)
          .leftJoin(blocks, eq(blocks.id, units.blockId))
          .where(isNull(units.deletedAt))
          .orderBy(...unitOrder()),
      ]);
      return { rows, assignees, unitRows };
    });
  }

  /** Tek talep + yorum akışı — düzenleme çekmecesini besleyen okuma. */
  async requestDetail(id: string) {
    return this.db.tx(async (tx) => {
      const [row] = await tx
        .select({
          request: requests,
          unitNumber: units.number,
          assignedFirstName: users.firstName,
          assignedLastName: users.lastName,
        })
        .from(requests)
        .leftJoin(units, eq(units.id, requests.unitId))
        .leftJoin(users, eq(users.id, requests.assignedToUserId))
        .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
        .limit(1);
      if (!row) return null;

      const comments = await tx
        .select({
          id: requestComments.id,
          body: requestComments.body,
          isInternal: requestComments.isInternal,
          firstName: users.firstName,
          lastName: users.lastName,
          createdAt: requestComments.createdAt,
        })
        .from(requestComments)
        .leftJoin(users, eq(users.id, requestComments.userId))
        .where(eq(requestComments.requestId, id))
        .orderBy(asc(requestComments.createdAt));

      return { ...row, comments };
    });
  }

  async maintenance(limit = 200) {
    return this.db.tx(async (tx) => {
      const [records, templates] = await Promise.all([
        tx
          .select()
          .from(maintenanceRecords)
          .where(isNull(maintenanceRecords.deletedAt))
          .orderBy(asc(maintenanceRecords.nextDueAt))
          .limit(limit),
        tx.select().from(maintenanceTemplates).limit(limit),
      ]);
      return { records, templates };
    });
  }

  /**
   * Bakım geçmişi — `recordId` verilirse yalnız o kaydın, yoksa sitenin
   * tamamının son satırları. Soft-delete edilmiş kayıtların geçmişi de
   * dönüyor: kaydı takipten çıkarmak yapılmış bakımı yok saymaz.
   */
  async maintenanceLogs(opts: { recordId?: string; limit?: number } = {}) {
    return this.db.tx((tx) =>
      tx
        .select({
          id: maintenanceLogs.id,
          recordId: maintenanceLogs.recordId,
          recordLabel: maintenanceRecords.label,
          templateCode: maintenanceTemplates.code,
          doneAt: maintenanceLogs.doneAt,
          costMinor: maintenanceLogs.costKurus,
          documentUrl: maintenanceLogs.documentUrl,
          note: maintenanceLogs.note,
          createdByName: sql<string | null>`nullif(trim(concat_ws(' ', ${users.firstName}, ${users.lastName})), '')`,
        })
        .from(maintenanceLogs)
        .innerJoin(maintenanceRecords, eq(maintenanceRecords.id, maintenanceLogs.recordId))
        .leftJoin(maintenanceTemplates, eq(maintenanceTemplates.id, maintenanceRecords.templateId))
        .leftJoin(users, eq(users.id, maintenanceLogs.createdByUserId))
        .where(opts.recordId ? eq(maintenanceLogs.recordId, opts.recordId) : undefined)
        .orderBy(desc(maintenanceLogs.doneAt), desc(maintenanceLogs.createdAt))
        .limit(opts.limit ?? 20),
    );
  }

  async reservations(limit = 100) {
    return this.db.tx(async (tx) => {
      const [resourceRows, rows] = await Promise.all([
        tx.select().from(resources).where(isNull(resources.deletedAt)),
        tx
          .select({
            id: reservations.id,
            resourceId: reservations.resourceId,
            resourceName: resources.name,
            unitNumber: units.number,
            startAt: reservations.startAt,
            endAt: reservations.endAt,
            guestCount: reservations.guestCount,
            status: reservations.status,
            feeKurus: reservations.feeKurus,
            note: reservations.note,
            userId: reservations.userId,
          })
          .from(reservations)
          .leftJoin(resources, eq(resources.id, reservations.resourceId))
          .leftJoin(units, eq(units.id, reservations.unitId))
          .orderBy(desc(reservations.startAt))
          .limit(limit),
      ]);
      return { resourceRows, rows };
    });
  }

  async meters(limit = 100) {
    return this.db.tx(async (tx) => {
      const [meterRows, readings] = await Promise.all([
        tx
          .select({
            id: meters.id,
            unitId: meters.unitId,
            unitNumber: units.number,
            type: meters.type,
            serialNo: meters.serialNo,
            isCommon: meters.isCommon,
            unitPriceKurus: meters.unitPriceKurus,
            isActive: meters.isActive,
          })
          .from(meters)
          .leftJoin(units, eq(units.id, meters.unitId))
          .where(isNull(meters.deletedAt))
          // Sayaç listesinde hiç sıra yoktu: satırlar veritabanının döndürdüğü
          // rastgele düzende geliyordu. Daire numarası doğal sırada.
          .orderBy(...unitNumberOrder()),

        tx
          .select({
            id: meterReadings.id,
            meterId: meterReadings.meterId,
            meterType: meters.type,
            unitNumber: units.number,
            period: meterReadings.period,
            previousValue: meterReadings.previousValue,
            currentValue: meterReadings.currentValue,
            consumption: meterReadings.consumption,
            amountKurus: meterReadings.amountKurus,
            readingDate: meterReadings.readingDate,
            anomalyFlag: meterReadings.anomalyFlag,
            debtId: meterReadings.debtId,
          })
          .from(meterReadings)
          .leftJoin(meters, eq(meters.id, meterReadings.meterId))
          .leftJoin(units, eq(units.id, meters.unitId))
          .orderBy(desc(meterReadings.readingDate))
          .limit(limit),
      ]);
      return { meterRows, readings };
    });
  }
}
