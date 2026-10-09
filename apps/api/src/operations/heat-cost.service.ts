import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { HeatCostPreview, HeatCostRequest } from "@yonetim/contracts";
import { debts, debtTypes, defaultDebtTypeFor, unitOccupancies } from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";
import { computeHeatShares } from "./heat-cost";

type Row = Record<string, unknown>;

/**
 * Isı pay ölçerli borçlandırma — dönemin ısı ölçer (`heat_calorimeter`) ve
 * sıcak su (`hot_water`) okumaları + daire m²'si → `computeHeatShares`.
 * Borçlandırınca dönemin bu okumaları borca bağlanır (kilit), aynı dönem
 * ikinci kez borçlandırılamaz.
 */
@Injectable()
export class HeatCostService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private async inputs(tx: Database, dto: HeatCostRequest) {
    const rows = (await tx.execute(sql`
      SELECT u.id, CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END AS label,
             coalesce(u.area_m2, 0)::float AS area,
             coalesce(sum(r.consumption) FILTER (WHERE m.type = 'heat_calorimeter'), 0)::float AS heat,
             coalesce(sum(r.consumption) FILTER (WHERE m.type = 'hot_water'), 0)::float AS water,
             bool_or(m.type = 'heat_calorimeter') AS has_heat,
             bool_or(r.debt_id IS NOT NULL) AS billed
      FROM units u
      LEFT JOIN blocks b ON b.id = u.block_id
      LEFT JOIN meters m ON m.unit_id = u.id AND m.deleted_at IS NULL AND m.type IN ('heat_calorimeter', 'hot_water')
      LEFT JOIN meter_readings r ON r.meter_id = m.id AND r.period = ${dto.period}
      WHERE u.deleted_at IS NULL
        ${dto.blockIds.length > 0 ? sql`AND u.block_id IN (${sql.join(dto.blockIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``}
      GROUP BY u.id, b.name, u.number, u.area_m2
      ORDER BY b.name NULLS FIRST, u.number
    `)) as unknown as Row[];
    return rows.map((r) => ({
      unitId: String(r.id),
      unitLabel: String(r.label),
      areaM2: Number(r.area),
      heatConsumption: Number(r.heat),
      waterConsumption: Number(r.water),
      hasHeatMeter: r.has_heat === true,
      billed: r.billed === true,
    }));
  }

  private compute(dto: HeatCostRequest, units: Awaited<ReturnType<HeatCostService["inputs"]>>): HeatCostPreview {
    const priced = units.filter((u) => u.areaM2 > 0);
    const result = computeHeatShares({
      mode: dto.mode,
      invoiceMinor: dto.invoiceMinor,
      commonPct: dto.commonPct,
      minConsumptionPct: dto.minConsumptionPct ?? null,
      readingFeeMinor: dto.readingFeeMinor,
      rounding: dto.rounding,
      water: dto.water ?? undefined,
      summerSplitEnergy: dto.summerSplitEnergy,
      units: priced,
    });
    const byId = new Map(result.rows.map((r) => [r.unitId, r]));
    const rows = priced.map((u) => {
      const r = byId.get(u.unitId);
      return {
        unitId: u.unitId,
        unitLabel: u.unitLabel,
        areaM2: u.areaM2,
        heatConsumption: u.heatConsumption,
        adjustedConsumption: r?.adjustedConsumption ?? 0,
        waterConsumption: u.waterConsumption,
        hasHeatMeter: u.hasHeatMeter,
        minApplied: r?.minApplied ?? false,
        commonMinor: r?.commonMinor ?? 0,
        consumptionMinor: r?.consumptionMinor ?? 0,
        coldWaterMinor: r?.coldWaterMinor ?? 0,
        waterHeatingMinor: r?.waterHeatingMinor ?? 0,
        readingFeeMinor: r?.readingFeeMinor ?? 0,
        totalMinor: r?.totalMinor ?? 0,
      };
    });
    return {
      rows,
      totals: {
        areaM2: priced.reduce((s, u) => s + u.areaM2, 0),
        heatConsumption: priced.reduce((s, u) => s + u.heatConsumption, 0),
        waterConsumption: priced.reduce((s, u) => s + u.waterConsumption, 0),
        waterHeatingMinor: result.waterHeatingMinor,
        totalMinor: rows.reduce((s, r) => s + r.totalMinor, 0),
      },
      error: result.error,
      alreadyBilled: units.some((u) => u.billed),
      missingArea: units.length - priced.length,
    };
  }

  async preview(dto: HeatCostRequest): Promise<HeatCostPreview> {
    return this.db.tx(async (tx) => this.compute(dto, await this.inputs(tx, dto)));
  }

  async bill(dto: HeatCostRequest): Promise<{ created: number; totalMinor: number }> {
    if (!dto.dueDate) throw new BadRequestException("validation_failed:dueDate");
    const tenantId = this.db.ctx().tenantId;
    const outcome = await this.db.tx(async (tx) => {
      const units = await this.inputs(tx, dto);
      const preview = this.compute(dto, units);
      if (preview.error) throw new BadRequestException(`validation_failed:${preview.error}`);
      if (preview.alreadyBilled) throw new ConflictException("conflict:heat_already_billed");

      const type = dto.debtTypeId
        ? (await tx.select().from(debtTypes).where(and(eq(debtTypes.id, dto.debtTypeId), isNull(debtTypes.deletedAt))).limit(1))[0]
        : await defaultDebtTypeFor(tx, tenantId, "utility");
      if (dto.debtTypeId && !type) throw new BadRequestException("validation_failed:debt_type");
      const label = { heat: "Isınma", heat_water: "Isınma ve sıcak su", summer_water: "Sıcak su" }[dto.mode];
      const description = dto.description ?? `${label} ${dto.period}`;

      let created = 0;
      let totalMinor = 0;
      for (const r of preview.rows) {
        if (r.totalMinor <= 0) continue;
        const occupants = await tx
          .select({ userId: unitOccupancies.userId, relation: unitOccupancies.relation })
          .from(unitOccupancies)
          .where(and(eq(unitOccupancies.unitId, r.unitId), isNull(unitOccupancies.endDate)))
          .orderBy(asc(unitOccupancies.startDate));
        const debtor = occupants.find((o) => o.relation === "tenant") ?? occupants.find((o) => o.relation === "owner") ?? null;
        const [debt] = await tx
          .insert(debts)
          .values({
            tenantId,
            unitId: r.unitId,
            debtorUserId: debtor?.userId ?? null,
            kind: type?.baseKind ?? "utility",
            debtTypeId: type?.id ?? null,
            period: dto.period,
            description,
            amountKurus: r.totalMinor,
            dueDate: dto.dueDate!,
            metadata: {
              heatCost: {
                mode: dto.mode,
                areaM2: r.areaM2,
                consumption: r.heatConsumption,
                adjusted: r.adjustedConsumption,
                water: r.waterConsumption,
                common: r.commonMinor,
                usage: r.consumptionMinor,
                coldWater: r.coldWaterMinor,
                waterHeating: r.waterHeatingMinor,
                readingFee: r.readingFeeMinor,
                minApplied: r.minApplied,
              },
            },
          })
          .returning({ id: debts.id });
        // Dönemin ısı/su okumaları borca bağlanır → düzeltme/silme kilitli.
        await tx.execute(sql`
          UPDATE meter_readings SET debt_id = ${debt!.id}, updated_at = now()
          WHERE period = ${dto.period} AND debt_id IS NULL
            AND meter_id IN (SELECT id FROM meters WHERE unit_id = ${r.unitId} AND type IN ('heat_calorimeter', 'hot_water'))
        `);
        created += 1;
        totalMinor += r.totalMinor;
      }
      return { created, totalMinor };
    });
    await this.audit.record({
      action: "heat_cost_billed",
      resource: "debt",
      diff: {
        period: { from: null, to: dto.period },
        mode: { from: null, to: dto.mode },
        invoiceMinor: { from: null, to: dto.invoiceMinor },
        created: { from: null, to: outcome.created },
      },
    });
    return outcome;
  }
}

