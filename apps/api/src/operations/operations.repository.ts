import { Injectable } from "@nestjs/common";
import { asc, desc, eq, isNull } from "drizzle-orm";

import {
  maintenanceRecords,
  maintenanceTemplates,
  meterReadings,
  meters,
  requests,
  reservations,
  resources,
  units,
} from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

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
    return this.db.tx(async (tx) =>
      tx
        .select()
        .from(requests)
        .where(isNull(requests.deletedAt))
        .orderBy(desc(requests.createdAt))
        .limit(limit),
    );
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
          .where(isNull(meters.deletedAt)),

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
