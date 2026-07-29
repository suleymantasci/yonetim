import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type {
  MeterDetail,
  MeterReadingBatch,
  MeterReadingBatchResult,
  MeterSave,
  MeterSaveResult,
} from "@yonetim/contracts";
import { meterReadings, meters, units } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

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
