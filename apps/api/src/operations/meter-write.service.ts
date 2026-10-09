import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";

import type {
  MeterBill,
  MeterBillResult,
  MeterDetail,
  MeterReadingCorrect,
  MeterReadingBatch,
  MeterReadingBatchResult,
  MeterSave,
  MeterSaveResult,
  MeterVendorImport,
  MeterVendorPreview,
} from "@yonetim/contracts";
import { readTable, type Cell } from "@yonetim/bank";
import { blocks, debts, meterReadings, meters, unitOccupancies, units } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";
import { parseVendorFile, serialKey } from "./meter-vendor-file";

/** Tüketim + okuma bedeli; istenirse tam liraya yuvarlanır. */
export function billAmount(consumptionMinor: number, feeMinor: number, roundLira: boolean): number {
  const total = consumptionMinor + feeMinor;
  return roundLira ? Math.round(total / 100) * 100 : total;
}

/**
 * Anomali eşiği — son okumaların ortalamasının kaç katı "sıçrama" sayılır.
 *
 * 3 kat, çünkü mevsimsel dalgalanma (kışın sıcak su, yazın sulama) iki katı
 * rahatlıkla buluyor; daha dar bir eşik her mevsim geçişinde yalancı uyarı
 * üretir ve uyarı yalancı olduğu anda okunmayı bırakır.
 */
const SPIKE_MULTIPLIER = 3;
/** Kaç geçmiş okumanın ortalaması alınır. */
const HISTORY_WINDOW = 3;

/**
 * Sayaç tanımı ve okuma girişi — PROJE-DURUMU §5.2, sıra 4.
 *
 * Bu modülün eksikliği tek bir ekranı değil **bir aidat formülünü** kapalı
 * tutuyordu: `dues_plan.formula = "meter"` bu veriye bağımlı ve besleyecek
 * okuma girilemediği için bugüne kadar kullanılamazdı.
 *
 * TÜRETİLMİŞ DEĞERLER SUNUCUDA: önceki endeks, tüketim, tutar ve anomali
 * işareti. İstemciden alınsalardı tüketim ile tutar arasındaki bağ
 * koparılabilirdi — ve o bağ sakine yansıyan faturanın kendisi.
 */
@Injectable()
export class MeterWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async detail(id: string): Promise<MeterDetail> {
    const row = await this.db.tx(async (tx) => {
      const [meter] = await tx
        .select()
        .from(meters)
        .where(and(eq(meters.id, id), isNull(meters.deletedAt)))
        .limit(1);
      if (!meter) return null;

      const [reading] = await tx
        .select({ id: meterReadings.id })
        .from(meterReadings)
        .where(eq(meterReadings.meterId, id))
        .limit(1);
      return { meter, hasReadings: Boolean(reading) };
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.meter.id,
      unitId: row.meter.unitId,
      type: row.meter.type,
      serialNo: row.meter.serialNo,
      isCommon: row.meter.isCommon,
      unitPriceMinor: row.meter.unitPriceKurus,
      initialValue: row.meter.initialValue,
      isActive: row.meter.isActive,
      hasReadings: row.hasReadings,
    };
  }

  async save(dto: MeterSave, id?: string): Promise<MeterSaveResult> {
    /*
     * "Ortak alan sayacı" ile "daireye bağlı sayaç" birbirini dışlıyor.
     * İkisinin birden dolu olması, tüketimin hem ortak gidere hem de tek
     * daireye yazılması demekti — aynı m³ iki kez faturalanırdı.
     */
    const isCommon = dto.isCommon || !dto.unitId;
    const unitId = isCommon ? null : (dto.unitId ?? null);

    const values = {
      unitId,
      type: dto.type,
      serialNo: dto.serialNo ?? null,
      isCommon,
      unitPriceKurus: dto.unitPriceMinor,
      isActive: dto.isActive,
    };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(meters)
          .values({
            ...values,
            tenantId: this.db.ctx().tenantId,
            initialValue: String(dto.initialValue),
          })
          .returning({ id: meters.id });
        if (!created) throw new NotFoundException("internal");
        return { id: created.id, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(meters)
        .where(and(eq(meters.id, id), isNull(meters.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      const [reading] = await tx
        .select({ id: meterReadings.id })
        .from(meterReadings)
        .where(eq(meterReadings.meterId, id))
        .limit(1);

      /*
       * İLK ENDEKS OKUMA GİRİLDİKTEN SONRA DEĞİŞMİYOR.
       *
       * Değişebilseydi, ilk dönemin tüketimi geriye dönük değişir ve faturası
       * çoktan kesilmiş bir tutar sessizce başka bir şeye dönüşürdü. Kayıt
       * hatası varsa doğru yol okumayı düzeltmek, başlangıcı oynatmak değil.
       */
      const initialValue = reading
        ? before.initialValue
        : String(dto.initialValue);
      if (reading && String(dto.initialValue) !== before.initialValue) {
        throw new BadRequestException("conflict:initial_value_locked");
      }

      await tx
        .update(meters)
        .set({ ...values, initialValue, updatedAt: new Date() })
        .where(eq(meters.id, id));

      return {
        id,
        diff: diffOf(before as unknown as Record<string, unknown>, values),
      };
    });

    await this.audit.record({
      action: id ? "meter_updated" : "meter_created",
      resource: "meter",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id };
  }

  /**
   * Dönemsel toplu okuma girişi.
   *
   * TEK İŞLEM: 60 daireli bir binada sayaç başına ayrı istek, yarım kalmış
   * bir tur ve tutarsız bir dönem demekti. Ya hepsi yazılır ya hiçbiri.
   */
  async recordBatch(
    dto: MeterReadingBatch,
  ): Promise<MeterReadingBatchResult> {
    const tenantId = this.db.ctx().tenantId;
    const ids = dto.entries.map((e) => e.meterId);

    const outcome = await this.db.tx(async (tx) => {
      const meterRows = await tx
        .select({
          id: meters.id,
          unitId: meters.unitId,
          unitNumber: units.number,
          initialValue: meters.initialValue,
          unitPriceKurus: meters.unitPriceKurus,
          isActive: meters.isActive,
        })
        .from(meters)
        .leftJoin(units, eq(units.id, meters.unitId))
        .where(and(inArray(meters.id, ids), isNull(meters.deletedAt)));

      const byId = new Map(meterRows.map((m) => [m.id, m] as const));

      // Bu dönemde zaten okuma var mı — tekil index'e çarpmadan önce bilmek
      // "atlandı" sayısını doğru raporlamayı mümkün kılıyor.
      const existing = await tx
        .select({
          id: meterReadings.id,
          meterId: meterReadings.meterId,
        })
        .from(meterReadings)
        .where(
          and(
            inArray(meterReadings.meterId, ids),
            eq(meterReadings.period, dto.period),
          ),
        );
      const existingByMeter = new Map(
        existing.map((r) => [r.meterId, r.id] as const),
      );

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let totalMinor = 0;
      const flagged: MeterReadingBatchResult["flagged"] = [];

      for (const entry of dto.entries) {
        const meter = byId.get(entry.meterId);
        // Pasif ya da silinmiş sayaç sessizce atlanıyor: tur sırasında
        // sökülmüş bir sayaç yüzünden tüm dönemin reddedilmesi doğru değil.
        if (!meter || !meter.isActive) {
          skipped += 1;
          continue;
        }

        const already = existingByMeter.get(entry.meterId);
        if (already && !dto.overwrite) {
          skipped += 1;
          continue;
        }

        const history = await tx
          .select({
            currentValue: meterReadings.currentValue,
            consumption: meterReadings.consumption,
          })
          .from(meterReadings)
          .where(eq(meterReadings.meterId, entry.meterId))
          .orderBy(desc(meterReadings.period))
          .limit(HISTORY_WINDOW);

        // Önceki endeks: son okuma varsa onun değeri, yoksa takılış endeksi.
        const previous = Number(
          history[0]?.currentValue ?? meter.initialValue,
        );
        const consumption = entry.currentValue - previous;

        const reason = anomalyReason(consumption, history);
        if (reason) {
          flagged.push({
            meterId: meter.id,
            unitNumber: meter.unitNumber,
            consumption: consumption.toFixed(3),
            reason,
          });
        }

        /*
         * NEGATİF TÜKETİM 0 ₺ FATURALANIYOR ama satır **siliniyor değil**.
         *
         * Sayaç değişimi ya da yanlış okuma gerçek olaylardır; kaydı atmak
         * "o ay okuma yapılmadı" demek olurdu. Negatif bir tutarı sakine
         * alacak olarak yazmak ise okuma hatasını paraya çevirirdi.
         */
        const amountKurus =
          consumption > 0
            ? Math.round(consumption * meter.unitPriceKurus)
            : 0;
        totalMinor += amountKurus;

        const values = {
          previousValue: previous.toFixed(3),
          currentValue: entry.currentValue.toFixed(3),
          consumption: consumption.toFixed(3),
          amountKurus,
          readingDate: dto.readingDate,
          anomalyFlag: reason !== null,
          readBy: this.db.ctx().userId ?? null,
        };

        if (already) {
          await tx
            .update(meterReadings)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(meterReadings.id, already));
          updated += 1;
        } else {
          await tx.insert(meterReadings).values({
            ...values,
            tenantId,
            meterId: meter.id,
            period: dto.period,
          });
          created += 1;
        }
      }

      return { created, updated, skipped, totalMinor, flagged };
    });

    await this.audit.record({
      action: "meter_readings_recorded",
      resource: "meter_reading",
      diff: {
        period: { from: null, to: dto.period },
        created: { from: null, to: outcome.created },
        updated: { from: null, to: outcome.updated },
      },
    });

    return { ...outcome, anomalies: outcome.flagged.length };
  }

  /**
   * Tek okumayı düzelt — gerekçeli.
   *
   * BORÇLANDIRILMIŞ OKUMA DÜZELTİLMEZ (409): sakine yansıyan tutar bu endekse
   * dayanıyor; önce borç iptal edilmeli. Sonraki dönemin okuması da bu
   * endeksi "önceki" olarak kullandığı için birlikte yeniden hesaplanıyor —
   * o da borçlandırıldıysa düzeltme reddediliyor.
   */
  async correctReading(id: string, dto: MeterReadingCorrect): Promise<{ id: string }> {
    const before = await this.db.txWithReason(dto.reason, async (tx) => {
      const reading = await this.lockedReading(tx, id);
      const meter = await this.meterOf(tx, reading.meterId);
      const next = await this.nextReading(tx, reading.meterId, reading.period);
      if (next?.debtId) throw new ConflictException("conflict:next_reading_billed");

      const previous = Number(reading.previousValue);
      await tx
        .update(meterReadings)
        .set({
          ...derive(previous, dto.currentValue, meter.unitPriceKurus),
          updatedAt: new Date(),
        })
        .where(eq(meterReadings.id, id));

      if (next) {
        await tx
          .update(meterReadings)
          .set({
            ...derive(dto.currentValue, Number(next.currentValue), meter.unitPriceKurus),
            updatedAt: new Date(),
          })
          .where(eq(meterReadings.id, next.id));
      }
      return reading;
    });

    await this.audit.record({
      action: "meter_reading_corrected",
      resource: "meter_reading",
      resourceId: id,
      diff: {
        currentValue: { from: before.currentValue, to: dto.currentValue.toFixed(3) },
        reason: { from: null, to: dto.reason },
      },
    });
    return { id };
  }

  /**
   * Okumayı sil — gerekçeli. Sonraki dönemin okuması, silinenden önceki
   * endekse (yoksa takılış endeksine) göre yeniden hesaplanıyor.
   */
  async removeReading(id: string, reason: string): Promise<{ id: string }> {
    const before = await this.db.txWithReason(reason, async (tx) => {
      const reading = await this.lockedReading(tx, id);
      const meter = await this.meterOf(tx, reading.meterId);
      const next = await this.nextReading(tx, reading.meterId, reading.period);
      if (next?.debtId) throw new ConflictException("conflict:next_reading_billed");

      await tx.delete(meterReadings).where(eq(meterReadings.id, id));

      if (next) {
        const [prior] = await tx
          .select({ currentValue: meterReadings.currentValue })
          .from(meterReadings)
          .where(
            and(
              eq(meterReadings.meterId, reading.meterId),
              lt(meterReadings.period, reading.period),
            ),
          )
          .orderBy(desc(meterReadings.period))
          .limit(1);
        const base = Number(prior?.currentValue ?? meter.initialValue);
        await tx
          .update(meterReadings)
          .set({
            ...derive(base, Number(next.currentValue), meter.unitPriceKurus),
            updatedAt: new Date(),
          })
          .where(eq(meterReadings.id, next.id));
      }
      return reading;
    });

    await this.audit.record({
      action: "meter_reading_deleted",
      resource: "meter_reading",
      resourceId: id,
      diff: {
        period: { from: before.period, to: null },
        currentValue: { from: before.currentValue, to: null },
        reason: { from: null, to: reason },
      },
    });
    return { id };
  }

  /**
   * Dönem tüketimini borçlandır.
   *
   * KİM ÖDER: tüketen — dairede aktif kiracı varsa kiracı, yoksa malik
   * (hisseli mülkiyette ilk malik; tutar küçük ve bölmek kuruş artığı
   * üretiyor). Ortak alan sayacı borçlandırılmaz: o tüketim gider olarak
   * dağıtılır. Tek işlem: yarım kalmış bir dönem olmasın.
   */
  async bill(dto: MeterBill): Promise<MeterBillResult> {
    const tenantId = this.db.ctx().tenantId;
    const outcome = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          id: meterReadings.id,
          amountKurus: meterReadings.amountKurus,
          consumption: meterReadings.consumption,
          debtId: meterReadings.debtId,
          unitId: meters.unitId,
          type: meters.type,
        })
        .from(meterReadings)
        .innerJoin(meters, eq(meters.id, meterReadings.meterId))
        .where(and(eq(meterReadings.period, dto.period), isNull(meters.deletedAt)))
        .for("update", { of: meterReadings });

      let billed = 0;
      let skipped = 0;
      let totalMinor = 0;
      for (const row of rows) {
        if (row.debtId || !row.unitId || row.amountKurus + dto.readingFeeMinor <= 0) {
          skipped += 1;
          continue;
        }
        const amountKurus = billAmount(row.amountKurus, dto.readingFeeMinor, dto.roundLira);
        if (amountKurus <= 0) {
          skipped += 1;
          continue;
        }
        const occupants = await tx
          .select({ userId: unitOccupancies.userId, relation: unitOccupancies.relation })
          .from(unitOccupancies)
          .where(and(eq(unitOccupancies.unitId, row.unitId), isNull(unitOccupancies.endDate)))
          .orderBy(asc(unitOccupancies.startDate));
        const debtor =
          occupants.find((o) => o.relation === "tenant") ??
          occupants.find((o) => o.relation === "owner") ??
          null;

        const [debt] = await tx
          .insert(debts)
          .values({
            tenantId,
            unitId: row.unitId,
            debtorUserId: debtor?.userId ?? null,
            kind: "utility",
            period: dto.period,
            description: `${METER_LABEL[row.type] ?? "Sayaç"} tüketimi ${dto.period} (${Number(row.consumption).toLocaleString("tr-TR")})${dto.readingFeeMinor > 0 ? " + okuma bedeli" : ""}`,
            amountKurus,
            dueDate: dto.dueDate,
            metadata: { meterReadingId: row.id, consumptionMinor: row.amountKurus, readingFeeMinor: dto.readingFeeMinor },
          })
          .returning({ id: debts.id });
        await tx
          .update(meterReadings)
          .set({ debtId: debt!.id, updatedAt: new Date() })
          .where(eq(meterReadings.id, row.id));
        billed += 1;
        totalMinor += amountKurus;
      }
      return { billed, skipped, totalMinor };
    });

    await this.audit.record({
      action: "meter_readings_billed",
      resource: "meter_reading",
      diff: {
        period: { from: null, to: dto.period },
        billed: { from: null, to: outcome.billed },
        totalMinor: { from: null, to: outcome.totalMinor },
      },
    });
    return outcome;
  }

  /**
   * Okuma firması dosyası — önizleme ve borçlandırma aynı eşleşmeden.
   * Aynı dönemde aynı sayaca firma dosyasından borç varsa `already`.
   */
  async vendorImport(dto: MeterVendorImport, commit: boolean): Promise<MeterVendorPreview & { created: number }> {
    let table: Cell[][];
    try {
      table = readTable(Buffer.from(dto.fileBase64, "base64")).rows;
    } catch {
      throw new BadRequestException("validation_failed:file");
    }
    const parsed = parseVendorFile(table);
    const tenantId = this.db.ctx().tenantId;
    const outcome = await this.db.tx(async (tx) => {
      const list = await tx
        .select({ id: meters.id, serialNo: meters.serialNo, unitId: meters.unitId, type: meters.type, number: units.number, blockName: blocks.name })
        .from(meters)
        .leftJoin(units, eq(units.id, meters.unitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(isNull(meters.deletedAt));
      const bySerial = new Map(list.filter((m) => m.serialNo).map((m) => [serialKey(m.serialNo!), m]));
      const done = new Set(
        (
          await tx
            .select({ serial: sql<string>`${debts.metadata}->>'vendorSerial'` })
            .from(debts)
            .where(and(eq(debts.period, dto.period), isNull(debts.deletedAt), sql`${debts.metadata} ? 'vendorSerial'`))
        ).map((r) => r.serial),
      );
      const rows = parsed.rows.map((r) => {
        const m = bySerial.get(serialKey(r.serialNo));
        const amountMinor = r.amountMinor + (r.amountMinor > 0 ? dto.readingFeeMinor : 0);
        const status: MeterVendorPreview["rows"][number]["status"] = !m
          ? "unmatched"
          : !m.unitId
            ? "no_unit"
            : done.has(serialKey(r.serialNo))
              ? "already"
              : amountMinor <= 0
                ? "zero"
                : "ok";
        return {
          line: r.line,
          serialNo: r.serialNo,
          consumption: r.consumption,
          amountMinor,
          unitLabel: m?.number ? (m.blockName ? `${m.blockName} / ${m.number}` : m.number) : null,
          status,
          meter: m,
        };
      });
      let created = 0;
      if (commit) {
        if (!dto.dueDate) throw new BadRequestException("validation_failed:dueDate");
        for (const r of rows) {
          if (r.status !== "ok" || !r.meter?.unitId) continue;
          const occupants = await tx
            .select({ userId: unitOccupancies.userId, relation: unitOccupancies.relation })
            .from(unitOccupancies)
            .where(and(eq(unitOccupancies.unitId, r.meter.unitId), isNull(unitOccupancies.endDate)))
            .orderBy(asc(unitOccupancies.startDate));
          const debtor = occupants.find((o) => o.relation === "tenant") ?? occupants.find((o) => o.relation === "owner") ?? null;
          await tx.insert(debts).values({
            tenantId,
            unitId: r.meter.unitId,
            debtorUserId: debtor?.userId ?? null,
            kind: "utility",
            period: dto.period,
            description: (dto.description ?? `${METER_LABEL[r.meter.type] ?? "Sayaç"} ${dto.period}`) + (r.consumption ? ` (${r.consumption})` : ""),
            amountKurus: r.amountMinor,
            dueDate: dto.dueDate,
            metadata: { vendorSerial: serialKey(r.serialNo), vendorLine: r.line, readingFeeMinor: dto.readingFeeMinor },
          });
          created += 1;
        }
      }
      return { rows: rows.map(({ meter: _m, ...r }) => r), created };
    });
    const totalMinor = outcome.rows.filter((r) => r.status === "ok").reduce((a, r) => a + r.amountMinor, 0);
    if (commit) {
      await this.audit.record({
        action: "meter_vendor_billed",
        resource: "meter_reading",
        diff: { period: { from: null, to: dto.period }, created: { from: null, to: outcome.created }, totalMinor: { from: null, to: totalMinor } },
      });
    }
    return { rows: outcome.rows, totalMinor, missing: parsed.missing, created: outcome.created };
  }

  private async lockedReading(tx: Database, id: string) {
    const [reading] = await tx
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.id, id))
      .limit(1)
      .for("update");
    if (!reading) throw new NotFoundException("not_found");
    if (reading.debtId) throw new ConflictException("conflict:reading_billed");
    return reading;
  }

  private async meterOf(tx: Database, meterId: string) {
    const [meter] = await tx
      .select({ initialValue: meters.initialValue, unitPriceKurus: meters.unitPriceKurus })
      .from(meters)
      .where(eq(meters.id, meterId))
      .limit(1);
    if (!meter) throw new NotFoundException("not_found");
    return meter;
  }

  private async nextReading(tx: Database, meterId: string, period: string) {
    const [next] = await tx
      .select({
        id: meterReadings.id,
        currentValue: meterReadings.currentValue,
        debtId: meterReadings.debtId,
      })
      .from(meterReadings)
      .where(and(eq(meterReadings.meterId, meterId), gt(meterReadings.period, period)))
      .orderBy(asc(meterReadings.period))
      .limit(1);
    return next ?? null;
  }

  /**
   * Sayacı kaldır — **soft delete**.
   *
   * Okumalar `on delete cascade` ile bağlı; sert silme geçmiş dönemlerin
   * tüketim kaydını da götürürdü ve o kayıtlar kesilmiş faturaların dayanağı.
   * Sökülen sayaç için doğru işlem `isActive: false`.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: meters.id })
        .from(meters)
        .where(and(eq(meters.id, id), isNull(meters.deletedAt)))
        .limit(1);
      if (!row) throw new NotFoundException("not_found");

      await tx
        .update(meters)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(meters.id, id));
    });

    await this.audit.record({
      action: "meter_deleted",
      resource: "meter",
      resourceId: id,
    });
    return { id };
  }
}

/**
 * Anomali nedeni — yoksa `null`.
 *
 * İki durum ayrı raporlanıyor çünkü sebepleri ve çözümleri farklı: negatif
 * tüketim sayaç değişimi/yanlış okuma, sıçrama ise kaçak ya da gerçek bir
 * kullanım artışı. Tek "şüpheli" etiketi altında birleştirmek, yöneticiyi
 * hangisini araştıracağı konusunda yalnız bırakırdı.
 */
function anomalyReason(
  consumption: number,
  history: { consumption: string }[],
): "negative" | "spike" | null {
  if (consumption < 0) return "negative";
  // Geçmiş yoksa karşılaştıracak bir şey yok; ilk okuma anomali sayılmaz.
  if (history.length === 0) return null;

  const values = history.map((h) => Number(h.consumption)).filter((v) => v > 0);
  if (values.length === 0) return null;

  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  return consumption > average * SPIKE_MULTIPLIER ? "spike" : null;
}

const METER_LABEL: Record<string, string> = {
  water: "Su",
  hot_water: "Sıcak su",
  gas: "Doğalgaz",
  electric: "Elektrik",
  heat_calorimeter: "Isınma (kalorimetre)",
};

/** Okumanın türetilmiş alanları — toplu girişle aynı kural (negatif tüketim 0 ₺). */
function derive(previous: number, current: number, unitPriceKurus: number) {
  const consumption = current - previous;
  return {
    previousValue: previous.toFixed(3),
    currentValue: current.toFixed(3),
    consumption: consumption.toFixed(3),
    amountKurus: consumption > 0 ? Math.round(consumption * unitPriceKurus) : 0,
  };
}
