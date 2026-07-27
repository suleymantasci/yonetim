import { Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  DebtChangeFeed,
  DebtDetail,
  DebtListQuery,
  DebtListResponse,
  OpenDebtList,
  UnitDebtSummary,
} from "@yonetim/contracts";

import { AuditService } from "../../governance/audit/audit.service";
import { DebtWriteRepository } from "./debt-write.repository";
import { DebtRepository } from "./debt.repository";
import type {
  DebtAdjust,
  DebtBulkCreate,
  DebtCreate,
  PaymentCollect,
} from "./types";

/**
 * Borç iş akışı — MIMARI-PLAN §8.5.
 *
 * Denetim kütüğünü **burası** yazıyor; panel `runAction`'ı `audit: "api"` diyor
 * ki kütükte iki satır oluşmasın. Borç tutar/vade değişikliği ayrıca DB
 * trigger'ı ile `audit_debt_changes` timeline'ına düşüyor — o kayıt sakine
 * gösterilecek olan, buradaki ise iç denetim kütüğü.
 */
@Injectable()
export class DebtService {
  constructor(
    private readonly repo: DebtRepository,
    private readonly write: DebtWriteRepository,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  list(q: DebtListQuery): Promise<DebtListResponse> {
    return this.repo.list(q);
  }

  async detail(id: string): Promise<DebtDetail> {
    const data = await this.repo.detail(id);
    if (!data) throw new NotFoundException("not_found");

    const debt = data.debt;
    return {
      debt: {
        id: debt.id,
        unitId: debt.unitId,
        debtorUserId: debt.debtorUserId,
        duesPlanId: debt.duesPlanId,
        kind: debt.kind,
        description: debt.description,
        period: debt.period,
        amountMinor: debt.amountKurus,
        paidMinor: debt.paidKurus,
        lateFeeMinor: debt.lateFeeKurus,
        dueDate: debt.dueDate,
        status: debt.status,
        lateFeeExempt: debt.lateFeeExempt,
        installmentNo: debt.installmentNo,
        installmentCount: debt.installmentCount,
        metadata: (debt.metadata ?? {}) as Record<string, unknown>,
        createdAt: debt.createdAt,
        deletedAt: debt.deletedAt,
      },
      unit: data.unit ?? { id: debt.unitId, number: "—", blockName: null },
      debtorName: data.nameOf(debt.debtorUserId),
      planName: data.planName,
      changes: data.changeRows.map((row) => ({
        id: row.id,
        changeType: row.changeType,
        oldAmountMinor: row.oldAmountKurus,
        newAmountMinor: row.newAmountKurus,
        oldDueDate: row.oldDueDate,
        newDueDate: row.newDueDate,
        changedByName: data.nameOf(row.changedBy),
        reason: row.reason,
        visibleToResident: row.visibleToResident,
        createdAt: row.createdAt,
      })),
      allocations: data.allocationRows.map((row) => ({
        paymentId: row.paymentId,
        amountMinor: row.amountMinor,
        paidAt: row.paidAt,
        method: row.method,
        receiptNo: row.receiptNo,
        payerName: data.nameOf(row.payerUserId),
      })),
      siblings: data.siblings,
    } as DebtDetail;
  }

  async changeFeed(limit: number): Promise<DebtChangeFeed> {
    return {
      rows: (await this.repo.recentChanges(limit)) as DebtChangeFeed["rows"],
    };
  }

  async unitSummary(): Promise<UnitDebtSummary> {
    return { rows: await this.repo.unitSummary() };
  }

  async openDebts(unitId: string): Promise<OpenDebtList> {
    return { rows: await this.repo.openDebtsForUnit(unitId) };
  }

  /* ---------------------------------------------------------------- *
   * Yazma
   * ---------------------------------------------------------------- */

  async create(dto: DebtCreate) {
    const created = await this.write.create(dto);
    await this.audit.record({
      action: "debt_created",
      resource: "debt",
      resourceId: created.ids[0],
      reason: `${created.ids.length} kalem · ${dto.description}`,
    });
    // §10: olay → bildirim üretimi buradan besleniyor (Track B2).
    this.events.emit("debt.created", { ids: created.ids, unitId: dto.unitId });
    return created;
  }

  preview(dto: DebtBulkCreate) {
    return this.write.preview(dto);
  }

  async bulkCreate(dto: DebtBulkCreate) {
    const result = await this.write.bulkCreate(dto);
    await this.audit.record({
      action: "debt_bulk_created",
      resource: "debt",
      reason: `${dto.period} · ${dto.description} · ${result.createdCount} borç, ${result.skippedCount} atlandı`,
    });
    this.events.emit("debt.bulk_created", {
      period: dto.period,
      count: result.createdCount,
    });
    return result;
  }

  async adjust(id: string, dto: DebtAdjust) {
    await this.write.adjust(id, dto);
    await this.audit.record({
      action: "debt_adjusted",
      resource: "debt",
      resourceId: id,
      reason: dto.reason,
    });
    this.events.emit("debt.adjusted", { id, reason: dto.reason });
    return { id };
  }

  async collect(dto: PaymentCollect) {
    const result = await this.write.collect(dto);
    await this.audit.record({
      action: "payment_collected",
      resource: "payment",
      resourceId: result.paymentId,
      reason: `${result.closedDebtCount} borç kapandı`,
    });
    this.events.emit("payment.received", {
      paymentId: result.paymentId,
      unitId: dto.unitId,
      amountMinor: dto.amountMinor,
    });
    return result;
  }

  async cancel(ids: string[], reason: string) {
    const affected = await this.write.cancel(ids, reason);
    await this.audit.record({
      action: "debt_bulk_cancelled",
      resource: "debt",
      reason: `${reason} (${affected}/${ids.length})`,
    });
    return { affected, requested: ids.length };
  }

  async setLateFeeExempt(ids: string[], exempt: boolean) {
    const affected = await this.write.setLateFeeExempt(ids, exempt);
    await this.audit.record({
      action: exempt ? "debt_late_fee_exempted" : "debt_late_fee_reinstated",
      resource: "debt",
      reason: `${affected}/${ids.length}`,
    });
    return { affected, requested: ids.length };
  }
}
