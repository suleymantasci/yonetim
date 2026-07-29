import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  ExpenseCategorySave,
  ExpenseDistribute,
  ExpenseSave,
} from "@yonetim/contracts";
import {
  dueDateFor,
  parsePeriodKey,
  periodKey,
  toIstanbul,
} from "@yonetim/core";
import {
  blocks, debts, expenseCategories, expenses, unitOrder, units,
} from "@yonetim/db";
import { distributeDues, type DuesFormula } from "@yonetim/dues";

import { DbService } from "../../infra/db/db.service";
import type { Database } from "../../property/unit/types";

/** Gider yazma yolu — SQL ve transaction sınırı burada. */
@Injectable()
export class ExpenseWriteRepository {
  constructor(private readonly db: DbService) {}

  /* ---------------------------------------------------------------- *
   * Kategori
   * ---------------------------------------------------------------- */

  async saveCategory(dto: ExpenseCategorySave): Promise<string> {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      let depth = 0;

      if (dto.parentId) {
        const [parent] = await tx
          .select({ id: expenseCategories.id, depth: expenseCategories.depth })
          .from(expenseCategories)
          .where(eq(expenseCategories.id, dto.parentId))
          .limit(1);
        if (!parent) throw new NotFoundException("not_found:parent");
        // İki seviye ile sınırlı: daha derin ağaç yöneticiye fayda vermiyor,
        // dağıtım formülünün hangi seviyeden geldiğini de belirsizleştiriyor.
        if (parent.depth >= 1)
          throw new BadRequestException("validation_failed:depth_limit");
        depth = parent.depth + 1;
      }

      // Kendini üst kategori seçme (döngü) engeli.
      if (dto.id && dto.parentId === dto.id) {
        throw new BadRequestException("validation_failed:self_parent");
      }

      const values = {
        tenantId: ctx.tenantId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        depth,
        distribution: dto.distribution,
        isShared: dto.isShared,
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        defaultVatRate:
          dto.defaultVatRate != null ? dto.defaultVatRate.toFixed(2) : null,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
      };

      if (dto.id) {
        await tx
          .update(expenseCategories)
          .set(values)
          .where(eq(expenseCategories.id, dto.id));
        return dto.id;
      }

      const [row] = await tx
        .insert(expenseCategories)
        .values(values)
        .returning({ id: expenseCategories.id });
      if (!row) throw new BadRequestException("internal");
      return row.id;
    });
  }

  /**
   * Kategori arşivleme.
   *
   * Altında gider veya alt kategori varsa **silinmez, pasifleştirilir**: geçmiş
   * gider kayıtlarının kategorisini kopartmak raporları bozardı. Pasif kategori
   * yeni gider formunda görünmez ama eski kayıtlarda adı okunmaya devam eder.
   */
  async archiveCategory(
    id: string,
  ): Promise<{ archived: boolean; usage: number }> {
    return this.db.tx(async (tx) => {
      const [usage] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(expenses)
        .where(and(eq(expenses.categoryId, id), isNull(expenses.deletedAt)));
      const [children] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(expenseCategories)
        .where(
          and(
            eq(expenseCategories.parentId, id),
            isNull(expenseCategories.deletedAt),
          ),
        );

      const inUse =
        Number(usage?.value ?? 0) > 0 || Number(children?.value ?? 0) > 0;

      if (inUse) {
        await tx
          .update(expenseCategories)
          .set({ isActive: false })
          .where(eq(expenseCategories.id, id));
        return { archived: false, usage: Number(usage?.value ?? 0) };
      }

      await tx
        .update(expenseCategories)
        .set({ deletedAt: new Date() })
        .where(eq(expenseCategories.id, id));
      return { archived: true, usage: 0 };
    });
  }

  /* ---------------------------------------------------------------- *
   * Gider
   * ---------------------------------------------------------------- */

  /**
   * KDV **tutar üzerinden hesaplanır, ayrı girilmez** (GAP-DURUM kararı 10):
   * `amountMinor` KDV dahil toplamdır, `vatKurus` orandan türetilir. Böylece
   * toplam ile kalem toplamı asla uyuşmazlık göstermez.
   */
  async save(
    dto: ExpenseSave,
  ): Promise<{ id: string; before: Record<string, unknown> | null }> {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const vatRate = dto.vatRate ?? 0.2;
      const vatKurus = Math.round((dto.amountMinor * vatRate) / (1 + vatRate));
      const istanbul = toIstanbul(dto.expenseDate);
      const period = periodKey({
        year: istanbul.getUTCFullYear(),
        month: istanbul.getUTCMonth() + 1,
      });

      const values = {
        tenantId: ctx.tenantId,
        categoryId: dto.categoryId ?? null,
        vendorName: dto.vendorName ?? null,
        description: dto.description,
        amountKurus: dto.amountMinor,
        vatRate: vatRate.toFixed(2),
        vatKurus,
        withholdingKurus: dto.withholdingMinor,
        invoiceNo: dto.invoiceNo ?? null,
        expenseDate: dto.expenseDate,
        paidAt: dto.isPaid ? dto.expenseDate : null,
        paidVia: dto.paidVia ?? null,
        attachmentUrl: dto.attachmentUrl ?? null,
        status: dto.status,
        period,
        createdBy: ctx.userId,
        approvedBy:
          dto.status === "approved" || dto.status === "paid"
            ? ctx.userId
            : null,
      };

      if (dto.id) {
        const [before] = await tx
          .select()
          .from(expenses)
          .where(eq(expenses.id, dto.id))
          .limit(1);
        if (!before) throw new NotFoundException("not_found");
        if (before.distributedAt) {
          // Dağıtılmış gider değiştirilemez: sakinlere yazılmış borçlarla
          // tutarsızlık doğar. Düzeltme için önce borçları iptal etmek gerekir.
          throw new ConflictException("conflict:already_distributed_edit");
        }
        await tx.update(expenses).set(values).where(eq(expenses.id, dto.id));
        return {
          id: dto.id,
          before: before as unknown as Record<string, unknown>,
        };
      }

      const [row] = await tx
        .insert(expenses)
        .values(values)
        .returning({ id: expenses.id });
      if (!row) throw new BadRequestException("internal");
      return { id: row.id, before: null };
    });
  }

  async setStatus(
    ids: string[],
    status: "approved" | "rejected" | "paid",
  ): Promise<number> {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const rows = await tx
        .update(expenses)
        .set({
          status,
          approvedBy: status === "rejected" ? null : ctx.userId,
          paidAt: status === "paid" ? new Date() : undefined,
        })
        .where(and(inArray(expenses.id, ids), isNull(expenses.deletedAt)))
        .returning({ id: expenses.id });
      return rows.length;
    });
  }

  async softDelete(ids: string[]): Promise<number> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(expenses.id, ids),
            isNull(expenses.deletedAt),
            // Dağıtılmış gider silinemez: karşılığında sakin borçları var.
            isNull(expenses.distributedAt),
          ),
        )
        .returning({ id: expenses.id });
      return rows.length;
    });
  }

  /* ---------------------------------------------------------------- *
   * Dağıtım — önizleme ve yazma aynı hesabı kullanır
   * ---------------------------------------------------------------- */

  async previewDistribution(dto: ExpenseDistribute) {
    return this.db.tx(async (tx) => {
      const { pool, targets } = await this.distributionInputs(tx, dto, false);
      const distribution = distributeDues({
        formula: dto.formula as DuesFormula,
        totalAmountKurus: pool,
        units: toDuesUnits(targets),
      });

      const rows = targets.map((unit) => ({
        unitId: unit.id,
        unitNumber: unit.number,
        amountMinor:
          distribution.shares.find((s) => s.unitId === unit.id)?.amountKurus ??
          0,
        exempt: unit.duesExempt,
      }));

      return {
        rows,
        totalMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
        unitCount: rows.filter((row) => row.amountMinor > 0).length,
        fellBackToEqual: distribution.fellBackToEqual === true,
      };
    });
  }

  /**
   * Gideri dairelere borç olarak yansıtır — GAP 4.1.4.
   *
   * Bir gider **yalnız bir kez** dağıtılabilir (`distributed_at` işareti).
   * İkinci deneme reddedilir; aksi halde aynı fatura sakine iki kez yazılırdı
   * ve geri almak tek tek borç iptali gerektirirdi.
   *
   * Borçlar ve "dağıtıldı" işareti **tek transaction** içinde yazılır; yarım
   * kalmış dağıtım oluşmaz.
   */
  async distribute(dto: ExpenseDistribute, label: string) {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const { pool, targets, expense } = await this.distributionInputs(
        tx,
        dto,
        true,
      );

      const distribution = distributeDues({
        formula: dto.formula as DuesFormula,
        totalAmountKurus: pool,
        units: toDuesUnits(targets),
      });

      const period =
        dto.period ??
        expense.period ??
        periodKey({
          year: expense.expenseDate.getFullYear(),
          month: expense.expenseDate.getMonth() + 1,
        });
      const parsed = parsePeriodKey(period);
      if (!parsed) throw new BadRequestException("validation_failed:period");
      const dueDate = dueDateFor(parsed, dto.dueDay);

      const rows: (typeof debts.$inferInsert)[] = [];
      for (const unit of targets) {
        const share = distribution.shares.find(
          (entry) => entry.unitId === unit.id,
        );
        if (!share || share.amountKurus <= 0) continue;
        rows.push({
          tenantId: ctx.tenantId,
          unitId: unit.id,
          // Gider payı ortak alan kaynaklı: KMK md.20 gereği malik yükümlüdür.
          debtorUserId: unit.currentOwnerId ?? unit.currentTenantId ?? null,
          kind: "utility",
          period,
          // Etiket panelden (kullanıcının dili), giderin açıklaması buradan.
          description: `${expense.description} — ${label}`.slice(0, 200),
          amountKurus: share.amountKurus,
          dueDate,
          lateFeeExempt: unit.lateFeeExempt,
          metadata: { sourceExpenseId: expense.id, formula: dto.formula },
        });
      }

      if (rows.length === 0) {
        throw new BadRequestException(
          "validation_failed:nothing_to_distribute",
        );
      }

      await tx.insert(debts).values(rows);
      await tx
        .update(expenses)
        .set({ distributedAt: new Date(), period })
        .where(eq(expenses.id, expense.id));

      return {
        debtCount: rows.length,
        totalMinor: rows.reduce((sum, row) => sum + (row.amountKurus ?? 0), 0),
      };
    });
  }

  /** Önizleme ve yazma için ortak girdiler — iki hesabın ayrışmaması için. */
  private async distributionInputs(
    tx: Database,
    dto: ExpenseDistribute,
    strict: boolean,
  ) {
    const [expense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, dto.expenseId), isNull(expenses.deletedAt)))
      .limit(1);
    if (!expense) throw new NotFoundException("not_found");

    if (strict) {
      if (expense.distributedAt)
        throw new ConflictException("conflict:already_distributed");
      if (expense.status === "rejected" || expense.status === "draft") {
        throw new ConflictException("conflict:not_approved_yet");
      }
    }

    const pool = dto.excludeVat
      ? expense.amountKurus - expense.vatKurus
      : expense.amountKurus;
    if (pool <= 0)
      throw new BadRequestException("validation_failed:nothing_to_distribute");

    const conditions = [isNull(units.deletedAt)];
    if (dto.blockIds.length > 0)
      conditions.push(inArray(units.blockId, dto.blockIds));

    const targets = await tx
      .select({
        id: units.id,
        number: units.number,
        landShare: units.landShare,
        areaM2: units.areaM2,
        residentCount: units.residentCount,
        duesMultiplier: units.duesMultiplier,
        duesExempt: units.duesExempt,
        lateFeeExempt: units.lateFeeExempt,
        currentOwnerId: units.currentOwnerId,
        currentTenantId: units.currentTenantId,
      })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      // Sıra dağıtımın **sonucunu** etkiliyor: bölünemeyen kalan kuruş son
      // birime yazılıyor. Doğal sıraya geçmek o kuruşun hangi daireye
      // düştüğünü değiştirir; önizleme ve yazma aynı fonksiyonu çağırdığı
      // için ikisi birlikte değişiyor, ayrışma olmuyor.
      .orderBy(...unitOrder());

    if (targets.length === 0)
      throw new BadRequestException("validation_failed:no_target_units");
    return { pool, targets, expense };
  }
}

type TargetUnit = {
  id: string;
  landShare: string | null;
  areaM2: string | null;
  residentCount: number;
  duesMultiplier: string;
  duesExempt: boolean;
};

function toDuesUnits(targets: TargetUnit[]) {
  return targets.map((unit) => ({
    id: unit.id,
    landShare: unit.landShare === null ? null : Number(unit.landShare),
    areaM2: unit.areaM2 === null ? null : Number(unit.areaM2),
    residentCount: unit.residentCount,
    multiplier: Number(unit.duesMultiplier),
    exempt: unit.duesExempt,
  }));
}
