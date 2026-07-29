import { Injectable } from "@nestjs/common";

import type {
  MaintenanceListResponse,
  MeterListResponse,
  RequestListResponse,
  ReservationListResponse,
} from "@yonetim/contracts";
import { MAINTENANCE_TEMPLATE_SEED } from "@yonetim/db";

import { OperationsRepository } from "./operations.repository";

const DAY_MS = 86_400_000;
/** "Yaklaşan bakım" penceresi. */
const SOON_DAYS = 30;
const CLOSED_REQUEST_STATUSES = ["resolved", "closed", "rejected"];

/**
 * `operations` iş akışı — MIMARI-PLAN §8.5, §9a.
 *
 * Ekranların üstündeki sayaçlar burada hesaplanıyor. Sebep yalnız "bir ekran
 * bir çağrı" değil: bu ölçülerin hepsi **zaman karşılaştırması** içeriyor
 * ("SLA aşıldı mı", "kaç gün kaldı") ve karşılaştırmanın ölçütü sunucunun
 * saati olmalı. İstemcide hesaplanırsa saati şaşmış bir tarayıcı yanlış
 * cevap verir — hem de tam olarak yanlış olmasının en pahalı olduğu yerde.
 */
@Injectable()
export class OperationsService {
  constructor(private readonly repo: OperationsRepository) {}

  async requests(): Promise<RequestListResponse> {
    const { rows, assignees, unitRows } = await this.repo.requests();
    const now = Date.now();

    const mapped = rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      category: r.category,
      priority: r.priority,
      status: r.status,
      slaDueAt: r.slaDueAt,
      resolvedAt: r.resolvedAt,
      costMinor: r.costKurus,
      createdAt: r.createdAt,
      slaBreached: Boolean(
        r.slaDueAt && r.slaDueAt.getTime() < now && !r.resolvedAt,
      ),
    }));

    const open = mapped.filter(
      (r) => !CLOSED_REQUEST_STATUSES.includes(r.status),
    );
    const resolved = rows.filter((r) => r.resolvedAt);
    const avgResolutionHours =
      resolved.length > 0
        ? Math.round(
            resolved.reduce(
              (sum, r) =>
                sum +
                (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000,
              0,
            ) / resolved.length,
          )
        : 0;

    return {
      rows: mapped,
      assignees: assignees.map((a) => ({
        id: a.id,
        name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || "—",
        role: a.role,
      })),
      units: unitRows,
      totals: {
        open: open.length,
        breached: open.filter((r) => r.slaBreached).length,
        resolved: resolved.length,
        avgResolutionHours,
      },
    };
  }

  async maintenance(): Promise<MaintenanceListResponse> {
    const { records, templates } = await this.repo.maintenance();
    const now = Date.now();

    const codeById = new Map(
      templates.map((tpl) => [tpl.id, tpl.code] as const),
    );

    const mapped = records.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      templateCode: r.templateId ? (codeById.get(r.templateId) ?? null) : null,
      label: r.label,
      equipmentType: r.equipmentType,
      location: r.location,
      intervalDays: r.intervalDays,
      lastDoneAt: r.lastDoneAt,
      nextDueAt: r.nextDueAt,
      lastCostMinor: r.lastCostKurus,
      isActive: r.isActive,
      daysUntilDue: Math.round((r.nextDueAt.getTime() - now) / DAY_MS),
    }));

    // Site kendi şablonlarını tanımlamadıysa yasal tohum listesi gösteriliyor:
    // boş liste, zorunlu bakımların varlığını kullanıcıdan gizlerdi.
    const templatesAreSeed = templates.length === 0;
    const library = templatesAreSeed
      ? MAINTENANCE_TEMPLATE_SEED.map((tpl) => ({
          id: null,
          code: tpl.code,
          equipmentType: tpl.equipmentType,
          name: tpl.name,
          intervalDays: tpl.intervalDays,
          regulatoryRef: tpl.regulatoryRef ?? null,
          isMandatory: tpl.isMandatory,
        }))
      : templates.map((tpl) => ({
          id: tpl.id,
          code: tpl.code,
          equipmentType: tpl.equipmentType,
          name: tpl.name,
          intervalDays: tpl.intervalDays,
          regulatoryRef: tpl.regulatoryRef,
          isMandatory: tpl.isMandatory,
        }));

    return {
      records: mapped,
      templates: library,
      templatesAreSeed,
      totals: {
        tracked: mapped.length,
        overdue: mapped.filter((r) => r.daysUntilDue < 0).length,
        soon: mapped.filter(
          (r) => r.daysUntilDue >= 0 && r.daysUntilDue <= SOON_DAYS,
        ).length,
        mandatory: library.filter((tpl) => tpl.isMandatory).length,
      },
    };
  }

  async reservations(): Promise<ReservationListResponse> {
    const { resourceRows, rows } = await this.repo.reservations();
    const now = Date.now();

    const mapped = rows.map((r) => ({
      id: r.id,
      resourceId: r.resourceId,
      resourceName: r.resourceName,
      unitNumber: r.unitNumber,
      startAt: r.startAt,
      endAt: r.endAt,
      guestCount: r.guestCount,
      status: r.status,
      feeMinor: r.feeKurus,
      note: r.note,
    }));

    return {
      resources: resourceRows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        capacity: r.capacity,
        feeMinor: r.feeKurus,
        feeUnit: r.feeUnit,
        depositMinor: r.depositKurus,
        requiresApproval: r.requiresApproval,
        maxHoursPerBooking: r.maxHoursPerBooking,
        openHour: r.openHour,
        closeHour: r.closeHour,
        isActive: r.isActive,
      })),
      rows: mapped,
      totals: {
        pending: mapped.filter((r) => r.status === "pending").length,
        upcoming: mapped.filter(
          (r) => r.startAt.getTime() > now && r.status !== "cancelled",
        ).length,
      },
    };
  }

  async meters(): Promise<MeterListResponse> {
    const { meterRows, readings } = await this.repo.meters();

    return {
      meters: meterRows.map((m) => ({
        id: m.id,
        unitId: m.unitId,
        unitNumber: m.unitNumber,
        type: m.type,
        serialNo: m.serialNo,
        isCommon: m.isCommon,
        unitPriceMinor: m.unitPriceKurus,
        isActive: m.isActive,
      })),
      readings: readings.map((r) => ({
        id: r.id,
        meterId: r.meterId,
        meterType: r.meterType,
        unitNumber: r.unitNumber,
        period: r.period,
        previousValue: r.previousValue,
        currentValue: r.currentValue,
        consumption: r.consumption,
        amountMinor: r.amountKurus,
        readingDate: r.readingDate,
        anomalyFlag: r.anomalyFlag,
      })),
      totals: {
        defined: meterRows.length,
        recentReadings: readings.length,
        anomalies: readings.filter((r) => r.anomalyFlag).length,
      },
    };
  }
}
