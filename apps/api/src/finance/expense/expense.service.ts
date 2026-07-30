import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import type {
  CategoryTree,
  ExpenseCategorySave,
  ExpenseDetail,
  ExpenseDistribute,
  ExpenseListQuery,
  ExpenseListResponse,
  ExpenseSave,
} from "@yonetim/contracts";

import { AuditService, diffOf } from "../../governance/audit/audit.service";
import { ExpenseWriteRepository } from "./expense-write.repository";
import { ExpenseRepository } from "./expense.repository";

@Injectable()
export class ExpenseService {
  constructor(
    private readonly repo: ExpenseRepository,
    private readonly write: ExpenseWriteRepository,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  list(q: ExpenseListQuery): Promise<ExpenseListResponse> {
    return this.repo.list(q);
  }

  async categoryTree(): Promise<CategoryTree> {
    return { roots: await this.repo.categoryTree() };
  }

  async detail(id: string): Promise<ExpenseDetail> {
    const data = await this.repo.detail(id);
    if (!data) throw new NotFoundException("not_found");

    const e = data.expense;
    return {
      expense: {
        id: e.id,
        description: e.description,
        vendorName: e.vendorName,
        categoryId: e.categoryId,
        amountMinor: e.amountKurus,
        vatMinor: e.vatKurus,
        vatRate: e.vatRate,
        withholdingMinor: e.withholdingKurus,
        invoiceNo: e.invoiceNo,
        expenseDate: e.expenseDate,
        paidAt: e.paidAt,
        paidVia: e.paidVia,
        bankAccountId: e.bankAccountId,
        period: e.period,
        status: e.status,
        distributedAt: e.distributedAt,
        attachmentUrl: e.attachmentUrl,
        createdAt: e.createdAt,
        deletedAt: e.deletedAt,
      },
      categoryName: data.categoryName,
      categoryDistribution: data.categoryDistribution,
      generatedDebts: data.generatedDebts,
    } as ExpenseDetail;
  }

  /* ---------------------------------------------------------------- *
   * Yazma
   * ---------------------------------------------------------------- */

  async saveCategory(dto: ExpenseCategorySave) {
    const id = await this.write.saveCategory(dto);
    await this.audit.record({
      action: "expense_category_saved",
      resource: "expense_category",
      resourceId: id,
      reason: dto.name,
    });
    return { id };
  }

  async archiveCategory(id: string) {
    const result = await this.write.archiveCategory(id);
    await this.audit.record({
      action: result.archived
        ? "expense_category_deleted"
        : "expense_category_deactivated",
      resource: "expense_category",
      resourceId: id,
      reason: result.archived
        ? "kullanımda değil, silindi"
        : `${result.usage} gider kaydı var`,
    });
    return result;
  }

  async save(dto: ExpenseSave) {
    const { id, before } = await this.write.save(dto);
    await this.audit.record({
      action: before ? "expense_updated" : "expense_created",
      resource: "expense",
      resourceId: id,
      diff: before
        ? diffOf(before, { amountKurus: dto.amountMinor, status: dto.status })
        : undefined,
      reason: dto.description,
    });
    return { id };
  }

  async setStatus(ids: string[], status: "approved" | "rejected" | "paid") {
    const affected = await this.write.setStatus(ids, status);
    await this.audit.record({
      action: `expense_${status}`,
      resource: "expense",
      reason: `${affected}/${ids.length}`,
    });
    return { affected, requested: ids.length };
  }

  async softDelete(ids: string[]) {
    const affected = await this.write.softDelete(ids);
    await this.audit.record({
      action: "expense_bulk_deleted",
      resource: "expense",
      reason: `${affected}/${ids.length}`,
    });
    return { affected, requested: ids.length };
  }

  previewDistribution(dto: ExpenseDistribute) {
    return this.write.previewDistribution(dto);
  }

  /**
   * Dağıtım yıkıcı: geri almak üretilen borçları tek tek iptal etmek demek ve
   * gider ikinci kez dağıtılamaz. Bu yüzden GAP-DURUM kararı 8 protokolde —
   * onaysız istek yazmaz.
   */
  async distribute(dto: ExpenseDistribute, label: string) {
    if (!dto.confirmed) throw new BadRequestException("preview_required");

    const result = await this.write.distribute(dto, label);
    await this.audit.record({
      action: "expense_distributed",
      resource: "expense",
      resourceId: dto.expenseId,
      reason: `${dto.formula} · ${result.debtCount} borç`,
    });
    this.events.emit("expense.distributed", {
      expenseId: dto.expenseId,
      debtCount: result.debtCount,
    });
    return result;
  }
}
