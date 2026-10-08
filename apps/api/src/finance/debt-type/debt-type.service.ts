import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import type { DebtTypeList, DebtTypeSave } from "@yonetim/contracts";
import {
  debts,
  debtTypes,
  ensureDefaultDebtTypes,
  tenants,
} from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import type { Database } from "../../property/unit/types";

/**
 * Borç türü tanımları — `/v1/panel/debt-types`.
 *
 * Silme yalnız **hiç borç bağlanmamış** türde: bağlı borcun borçlu kuralı ve
 * gecikmesi bu kayıttan okunuyor; yerine pasifleştirme (yeni borçta
 * seçilmez, eskiler işlemeye devam eder).
 */
@Injectable()
export class DebtTypeService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DebtTypeList> {
    const tenantId = this.db.ctx().tenantId;
    return this.db.tx(async (tx) => {
      await ensureDefaultDebtTypes(tx, tenantId);
      const rows = await tx
        .select({
          row: debtTypes,
          debtCount: sql<number>`(
            SELECT COUNT(*)::int FROM debts d
            -- Nitelemeli yazılıyor: drizzle burada sütunu tablo adı olmadan
            -- basıyor ve "id" iç sorgudaki d.id'ye bağlanıyordu (sayı hep 0).
            WHERE d.debt_type_id = debt_types.id AND d.deleted_at IS NULL
          )`,
        })
        .from(debtTypes)
        .where(isNull(debtTypes.deletedAt))
        .orderBy(asc(debtTypes.sortOrder), asc(debtTypes.name));

      const [tenant] = await tx
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      const settings = (tenant?.settings ?? {}) as { lateFeeMonthlyPct?: number };

      return {
        rows: rows.map(({ row, debtCount }) => ({
          id: row.id,
          name: row.name,
          baseKind: row.baseKind,
          debtor: row.debtor as "occupant" | "owner",
          lateFeeMode: row.lateFeeMode as "none" | "monthly" | "daily",
          lateFeeMonthlyPct:
            row.lateFeeMonthlyPct === null ? null : Number(row.lateFeeMonthlyPct),
          accountCode: row.accountCode,
          isActive: row.isActive,
          sortOrder: row.sortOrder,
          debtCount: Number(debtCount),
        })),
        siteLateFeeMonthlyPct:
          settings.lateFeeMonthlyPct ?? siteConfig.dues.monthlyLateFeePct,
      };
    });
  }

  async create(dto: DebtTypeSave): Promise<{ id: string }> {
    const tenantId = this.db.ctx().tenantId;
    const id = await this.db.tx(async (tx) => {
      await ensureDefaultDebtTypes(tx, tenantId);
      await this.assertNameFree(tx, dto.name);
      const [row] = await tx
        .insert(debtTypes)
        .values({ tenantId, ...columns(dto) })
        .returning({ id: debtTypes.id });
      return row!.id;
    });
    await this.audit.record({
      action: "debt_type_created",
      resource: "debt_type",
      resourceId: id,
      diff: { name: { from: null, to: dto.name } },
    });
    return { id };
  }

  async update(id: string, dto: DebtTypeSave): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      await this.find(tx, id);
      await this.assertNameFree(tx, dto.name, id);
      await tx
        .update(debtTypes)
        .set({ ...columns(dto), updatedAt: new Date() })
        .where(eq(debtTypes.id, id));
    });
    await this.audit.record({
      action: "debt_type_updated",
      resource: "debt_type",
      resourceId: id,
    });
    return { id };
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      await this.find(tx, id);
      const [used] = await tx
        .select({ id: debts.id })
        .from(debts)
        .where(and(eq(debts.debtTypeId, id), isNull(debts.deletedAt)))
        .limit(1);
      if (used) throw new ConflictException("conflict:debt_type_in_use");
      await tx
        .update(debtTypes)
        .set({ deletedAt: new Date() })
        .where(eq(debtTypes.id, id));
    });
    await this.audit.record({
      action: "debt_type_deleted",
      resource: "debt_type",
      resourceId: id,
    });
    return { id };
  }

  private async find(tx: Database, id: string) {
    const [row] = await tx
      .select({ id: debtTypes.id })
      .from(debtTypes)
      .where(and(eq(debtTypes.id, id), isNull(debtTypes.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("not_found");
    return row;
  }

  /** Kısmi tekil index de engelliyor; 23505 yerine okunur 409 için önce bakılır. */
  private async assertNameFree(tx: Database, name: string, exceptId?: string) {
    const [dup] = await tx
      .select({ id: debtTypes.id })
      .from(debtTypes)
      .where(
        and(
          sql`lower(${debtTypes.name}) = lower(${name})`,
          isNull(debtTypes.deletedAt),
          ...(exceptId ? [ne(debtTypes.id, exceptId)] : []),
        ),
      )
      .limit(1);
    if (dup) throw new ConflictException("conflict:debt_type_name_taken");
  }
}

function columns(dto: DebtTypeSave) {
  return {
    name: dto.name,
    baseKind: dto.baseKind,
    debtor: dto.debtor,
    lateFeeMode: dto.lateFeeMode,
    lateFeeMonthlyPct:
      dto.lateFeeMode === "none" || dto.lateFeeMonthlyPct == null
        ? null
        : String(dto.lateFeeMonthlyPct),
    accountCode: dto.accountCode || null,
    isActive: dto.isActive,
    sortOrder: dto.sortOrder,
  };
}
