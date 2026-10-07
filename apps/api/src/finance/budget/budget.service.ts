import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import {
  BUDGET_STAFF_KEY,
  monthsBetween,
  type BudgetApprove,
  type BudgetDetail,
  type BudgetRow,
  type BudgetSave,
  type BudgetToDuesPlan,
} from "@yonetim/contracts";
import {
  blocks,
  duesPlans,
  expenseCategories,
  operatingBudgetLines,
  operatingBudgets,
  units,
} from "@yonetim/db";
import { distributeDues, type DuesFormula } from "@yonetim/dues";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { istanbulEnd, istanbulStart } from "../accounting/accounting.service";
import { DuesPlanService } from "../dues-plan/dues-plan.service";

type Tx = Parameters<Parameters<DbService["tx"]>[0]>[0];
type BudgetRecord = typeof operatingBudgets.$inferSelect;
type Row = Record<string, unknown>;

/**
 * İşletme projesi (KMK 37).
 *
 * Kat malikleri kurulu yıllık (ya da dönemlik) gider tahminini onaylar;
 * her malik payına düşen avansı öder (KMK 20: aksine karar yoksa arsa payı
 * oranında). Burada:
 *  - kalemler + yedek pay = proje toplamı, ay sayısına bölünüp aylık avans;
 *  - daire başı dağılım aidat motorunun **aynı** fonksiyonuyla
 *    (`distributeDues`) — projede görülen tutar, borçlandırılan tutarla aynı;
 *  - gerçekleşen: dönem içindeki onaylı/ödenmiş giderler (kategoriye göre) ve
 *    personel tahakkukları;
 *  - onaylanan proje kilitli; aidat planına dönüşünce aylık borçlandırma
 *    o plandan (worker) yürür.
 */
@Injectable()
export class BudgetService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly duesPlansService: DuesPlanService,
  ) {}

  async list(): Promise<{ rows: BudgetRow[] }> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(operatingBudgets)
        .where(isNull(operatingBudgets.deletedAt))
        .orderBy(
          desc(operatingBudgets.startPeriod),
          desc(operatingBudgets.createdAt),
        );
      const out: BudgetRow[] = [];
      for (const b of rows) {
        const lines = await tx
          .select()
          .from(operatingBudgetLines)
          .where(eq(operatingBudgetLines.budgetId, b.id));
        const actual = await actuals(tx, b);
        out.push(toRow(b, sumPlanned(lines), actual.total));
      }
      return { rows: out };
    });
  }

  async options(): Promise<{ categories: { id: string; name: string }[] }> {
    return this.db.tx(async (tx) => ({
      categories: await tx
        .select({ id: expenseCategories.id, name: expenseCategories.name })
        .from(expenseCategories)
        .orderBy(asc(expenseCategories.name)),
    }));
  }

  async detail(id: string): Promise<BudgetDetail> {
    return this.db.tx(async (tx) => {
      const b = await load(tx, id);
      const [lines, categories, unitRows, overlap] = await Promise.all([
        tx
          .select()
          .from(operatingBudgetLines)
          .where(eq(operatingBudgetLines.budgetId, id))
          .orderBy(asc(operatingBudgetLines.sortOrder)),
        tx
          .select({ id: expenseCategories.id, name: expenseCategories.name })
          .from(expenseCategories)
          .orderBy(asc(expenseCategories.name)),
        tx
          .select({ u: units, blockName: blocks.name })
          .from(units)
          .leftJoin(blocks, eq(blocks.id, units.blockId))
          .where(isNull(units.deletedAt))
          .then((rows) =>
            rows.sort((a, b) =>
              naturalUnit(a.blockName, a.u.number, b.blockName, b.u.number),
            ),
          ),
        tx
          .select({ c: sql<number>`count(*)::int` })
          .from(duesPlans)
          .where(
            and(
              isNull(duesPlans.deletedAt),
              eq(duesPlans.isActive, true),
              sql`${duesPlans.startPeriod} <= ${b.endPeriod}`,
              sql`coalesce(${duesPlans.endPeriod}, '9999-12') >= ${b.startPeriod}`,
              b.duesPlanId
                ? sql`${duesPlans.id} <> ${b.duesPlanId}`
                : sql`true`,
            ),
          ),
      ]);
      const actual = await actuals(tx, b);
      const months = monthsBetween(b.startPeriod, b.endPeriod);
      const elapsed = elapsedMonths(b);
      const linesTotal = sumPlanned(lines);
      const row = toRow(b, linesTotal, actual.total);
      const categoryName = new Map(categories.map((c) => [c.id, c.name]));

      const formula = distributionFormula(b);
      const distribution = distributeDues({
        formula: formula.formula,
        totalAmountKurus: row.monthlyMinor,
        mixWeights: formula.mixWeights,
        units: unitRows.map(({ u }) => ({
          id: u.id,
          landShare: u.landShare ? Number(u.landShare) : null,
          areaM2: u.areaM2 ? Number(u.areaM2) : null,
          residentCount: u.residentCount,
          multiplier: u.duesMultiplier ? Number(u.duesMultiplier) : 1,
          exempt: u.duesExempt,
        })),
      });
      const shareOf = new Map(distribution.shares.map((s) => [s.unitId, s]));

      return {
        budget: row,
        lines: lines.map((l) => ({
          id: l.id,
          categoryId: l.categoryId,
          isStaff: l.isStaff,
          sourceName: l.isStaff
            ? "Personel"
            : l.categoryId
              ? (categoryName.get(l.categoryId) ?? null)
              : null,
          label: l.label,
          plannedMinor: l.plannedKurus,
          actualMinor: l.isStaff
            ? actual.staff
            : l.categoryId
              ? (actual.byCategory.get(l.categoryId) ?? 0)
              : null,
          expectedToDateMinor: Math.round((l.plannedKurus * elapsed) / months),
        })),
        overlappingDuesPlans: overlap[0]?.c ?? 0,
        unplannedActualMinor: unplanned(lines, actual),
        reserveMinor: row.totalMinor - linesTotal,
        elapsedMonths: elapsed,
        shares: unitRows.map(({ u, blockName }) => {
          const s = shareOf.get(u.id);
          const monthly = s?.amountKurus ?? 0;
          return {
            unitId: u.id,
            label: blockName ? `${blockName} / ${u.number}` : u.number,
            weight: s?.weight ?? 0,
            exempt: s?.exempt ?? Boolean(u.duesExempt),
            monthlyMinor: monthly,
            totalMinor: monthly * months,
          };
        }),
        fellBackToEqual: distribution.fellBackToEqual,
        categories,
      };
    });
  }

  async save(dto: BudgetSave, id?: string): Promise<{ id: string }> {
    const savedId = await this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      if (id) {
        const b = await load(tx, id);
        if (b.status === "approved")
          throw new ConflictException("conflict:budget_approved");
      }
      const values = {
        tenantId: ctx.tenantId,
        name: dto.name,
        startPeriod: dto.startPeriod,
        endPeriod: dto.endPeriod,
        formula: dto.formula,
        mixEqualPct: dto.mixEqualPct,
        reservePct: dto.reservePct.toFixed(2),
        notes: dto.notes ?? null,
        updatedAt: new Date(),
      };
      let budgetId = id;
      if (budgetId) {
        await tx
          .update(operatingBudgets)
          .set(values)
          .where(eq(operatingBudgets.id, budgetId));
        await tx
          .delete(operatingBudgetLines)
          .where(eq(operatingBudgetLines.budgetId, budgetId));
      } else {
        const [row] = await tx
          .insert(operatingBudgets)
          .values({ ...values, createdBy: ctx.userId ?? null })
          .returning({ id: operatingBudgets.id });
        budgetId = row!.id;
      }
      await tx.insert(operatingBudgetLines).values(
        dto.lines.map((l, i) => ({
          tenantId: ctx.tenantId,
          budgetId: budgetId!,
          categoryId:
            l.source && l.source !== BUDGET_STAFF_KEY ? l.source : null,
          isStaff: l.source === BUDGET_STAFF_KEY,
          label: l.label,
          plannedKurus: l.plannedMinor,
          sortOrder: i,
        })),
      );
      return budgetId!;
    });
    await this.audit.record({
      action: id ? "budget_updated" : "budget_created",
      resource: "operating_budget",
      resourceId: savedId,
      reason: dto.name,
    });
    return { id: savedId };
  }

  async approve(id: string, dto: BudgetApprove): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const b = await load(tx, id);
      if (b.status === "approved")
        throw new ConflictException("conflict:budget_approved");
      await tx
        .update(operatingBudgets)
        .set({
          status: "approved",
          approvedAt: new Date(),
          approvalNote: dto.note,
          updatedAt: new Date(),
        })
        .where(eq(operatingBudgets.id, id));
    });
    await this.audit.record({
      action: "budget_approved",
      resource: "operating_budget",
      resourceId: id,
      reason: dto.note,
    });
    return { id };
  }

  /**
   * Onaylı projeyi aylık aidat planına çevirir. Aylık tutar plan havuzu
   * olur; formül projeninki (eşit dağıtım → `mixed` %100 eşit, çünkü
   * `equal` daire başı sabit tutar istiyor, havuz değil).
   */
  async toDuesPlan(
    id: string,
    dto: BudgetToDuesPlan,
  ): Promise<{ id: string; duesPlanId: string }> {
    const { budget, monthly } = await this.db.tx(async (tx) => {
      const b = await load(tx, id);
      if (b.status !== "approved")
        throw new ConflictException("conflict:budget_not_approved");
      if (b.duesPlanId)
        throw new ConflictException("conflict:dues_plan_exists");
      const lines = await tx
        .select()
        .from(operatingBudgetLines)
        .where(eq(operatingBudgetLines.budgetId, id));
      return {
        budget: b,
        monthly: toRow(b, sumPlanned(lines), 0).monthlyMinor,
      };
    });
    if (monthly <= 0)
      throw new BadRequestException("validation_failed:budget_empty");
    const formula =
      budget.formula === "equal"
        ? "mixed"
        : (budget.formula as "land_share" | "area" | "mixed");
    const plan = await this.duesPlansService.save({
      name: `İşletme projesi: ${budget.name}`.slice(0, 120),
      period: "monthly",
      formula,
      baseAmountMinor: 0,
      totalAmountMinor: monthly,
      mixEqualPct: budget.formula === "equal" ? 100 : budget.mixEqualPct,
      dueDayOfMonth: dto.dueDayOfMonth,
      lateFeeDailyMode: false,
      startPeriod: budget.startPeriod,
      endPeriod: budget.endPeriod,
      blockIds: [],
      unitTypes: [],
      isActive: true,
      notes:
        `İşletme projesinden üretildi (${budget.approvalNote ?? ""})`.slice(
          0,
          1000,
        ),
    });
    await this.db.tx(async (tx) => {
      await tx
        .update(operatingBudgets)
        .set({ duesPlanId: plan.id, updatedAt: new Date() })
        .where(eq(operatingBudgets.id, id));
    });
    await this.audit.record({
      action: "budget_dues_plan_created",
      resource: "operating_budget",
      resourceId: id,
      reason: plan.id,
    });
    return { id, duesPlanId: plan.id };
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const b = await load(tx, id);
      if (b.status === "approved")
        throw new ConflictException("conflict:budget_approved");
      await tx
        .update(operatingBudgets)
        .set({ deletedAt: new Date() })
        .where(eq(operatingBudgets.id, id));
    });
    await this.audit.record({
      action: "budget_deleted",
      resource: "operating_budget",
      resourceId: id,
    });
    return { id };
  }
}

/** "A / 2" "A / 10"dan önce: blok adı, sonra daire no doğal sırayla. */
function naturalUnit(
  blockA: string | null,
  numA: string,
  blockB: string | null,
  numB: string,
): number {
  return (
    (blockA ?? "").localeCompare(blockB ?? "", "tr", { numeric: true }) ||
    numA.localeCompare(numB, "tr", { numeric: true })
  );
}

async function load(tx: Tx, id: string): Promise<BudgetRecord> {
  const [b] = await tx
    .select()
    .from(operatingBudgets)
    .where(and(eq(operatingBudgets.id, id), isNull(operatingBudgets.deletedAt)))
    .limit(1);
  if (!b) throw new NotFoundException("not_found");
  return b;
}

const sumPlanned = (lines: { plannedKurus: number }[]) =>
  lines.reduce((s, l) => s + l.plannedKurus, 0);

/** Proje toplamı: kalemler + yedek; aylık avans kuruşa yuvarlanmış. */
function toRow(b: BudgetRecord, linesTotal: number, actual: number): BudgetRow {
  const months = monthsBetween(b.startPeriod, b.endPeriod);
  const reservePct = Number(b.reservePct);
  const total = Math.round(linesTotal * (1 + reservePct / 100));
  return {
    id: b.id,
    name: b.name,
    startPeriod: b.startPeriod,
    endPeriod: b.endPeriod,
    months,
    formula: b.formula,
    mixEqualPct: b.mixEqualPct,
    reservePct,
    status: b.status === "approved" ? "approved" : "draft",
    approvedAt: b.approvedAt,
    approvalNote: b.approvalNote,
    duesPlanId: b.duesPlanId,
    notes: b.notes,
    linesMinor: linesTotal,
    totalMinor: total,
    monthlyMinor: Math.round(total / months),
    actualMinor: actual,
    createdAt: b.createdAt,
  };
}

function distributionFormula(b: BudgetRecord): {
  formula: DuesFormula;
  mixWeights?: Partial<Record<DuesFormula, number>>;
} {
  if (b.formula === "mixed")
    return {
      formula: "mixed",
      mixWeights: { equal: b.mixEqualPct, land_share: 100 - b.mixEqualPct },
    };
  if (b.formula === "equal")
    return { formula: "mixed", mixWeights: { equal: 100 } };
  return { formula: b.formula as DuesFormula };
}

/** Dönemin bugüne kadar geçen ay sayısı (içinde bulunulan ay dahil). */
function elapsedMonths(b: BudgetRecord): number {
  const now = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 7);
  if (now < b.startPeriod) return 0;
  const end = now > b.endPeriod ? b.endPeriod : now;
  return monthsBetween(b.startPeriod, end);
}

interface Actuals {
  byCategory: Map<string, number>;
  uncategorized: number;
  staff: number;
  total: number;
}

/** Dönem içindeki (bugüne kadar) onaylı/ödenmiş giderler ve personel tahakkukları. */
async function actuals(tx: Tx, b: BudgetRecord): Promise<Actuals> {
  const start = istanbulStart(`${b.startPeriod}-01`).toISOString();
  const [ey, em] = b.endPeriod.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const end = istanbulEnd(
    `${b.endPeriod}-${String(lastDay).padStart(2, "0")}`,
  ).toISOString();
  const rows = (await tx.execute(sql`
    SELECT e.category_id, coalesce(sum(e.amount_kurus), 0)::bigint AS total
    FROM expenses e
    WHERE e.deleted_at IS NULL AND e.staff_id IS NULL AND e.status IN ('approved', 'paid')
      AND e.expense_date BETWEEN ${start}::timestamptz AND ${end}::timestamptz
    GROUP BY 1
  `)) as unknown as Row[];
  const [staffRow] = (await tx.execute(sql`
    SELECT coalesce(sum(amount_kurus), 0)::bigint AS total
    FROM staff_ledger_entries
    WHERE voided_at IS NULL AND kind = 'accrual' AND entry_date BETWEEN ${start}::timestamptz AND ${end}::timestamptz
  `)) as unknown as Row[];
  const byCategory = new Map<string, number>();
  let uncategorized = 0;
  for (const r of rows) {
    if (r.category_id) byCategory.set(String(r.category_id), Number(r.total));
    else uncategorized += Number(r.total);
  }
  const staff = Number(staffRow?.total ?? 0);
  const total =
    [...byCategory.values()].reduce((s, v) => s + v, 0) + uncategorized + staff;
  return { byCategory, uncategorized, staff, total };
}

/** Projede karşılığı olmayan gerçekleşen: bağlanmamış kategoriler, kategorisizler, (kalem yoksa) personel. */
function unplanned(
  lines: { categoryId: string | null; isStaff: boolean }[],
  a: Actuals,
): number {
  const planned = new Set(lines.map((l) => l.categoryId).filter(Boolean));
  let sum = a.uncategorized;
  for (const [cat, v] of a.byCategory) if (!planned.has(cat)) sum += v;
  if (!lines.some((l) => l.isStaff)) sum += a.staff;
  return sum;
}
