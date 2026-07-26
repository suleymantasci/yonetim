import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { expenseCategories, expenses, withTenant } from "@yonetim/db";

import type { AppContext } from "../context";
import type { ListParams } from "../list-params";

/**
 * Gider sorguları — GAP 4.1.4.
 */
const SORT_COLUMNS = {
  expenseDate: expenses.expenseDate,
  amount: expenses.amountKurus,
  category: expenseCategories.name,
  vendor: expenses.vendorName,
  status: expenses.status,
} as const;

export const EXPENSE_SORT_KEYS = Object.keys(SORT_COLUMNS) as (keyof typeof SORT_COLUMNS)[];

export interface ExpenseListRow {
  id: string;
  description: string;
  vendorName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  amountKurus: number;
  vatKurus: number;
  withholdingKurus: number;
  invoiceNo: string | null;
  expenseDate: Date;
  paidAt: Date | null;
  status: string;
  distributedAt: Date | null;
  period: string | null;
  attachmentUrl: string | null;
}

export interface ExpenseListResult {
  rows: ExpenseListRow[];
  total: number;
  categories: { id: string; name: string; depth: number; color: string | null }[];
  periods: string[];
  totals: {
    monthKurus: number;
    yearKurus: number;
    pendingKurus: number;
    undistributedKurus: number;
  };
  /** Kategori kırılımı (bu ay) — yatay sütun grafiği için. */
  byCategory: { name: string; amountKurus: number }[];
}

export async function listExpenses(
  ctx: AppContext,
  params: ListParams,
): Promise<ExpenseListResult> {
  return withTenant(ctx.tenantId, async (tx) => {
    const conditions: SQL[] = [
      params.trashed ? sql`${expenses.deletedAt} IS NOT NULL` : isNull(expenses.deletedAt),
    ];

    if (params.query) {
      const needle = `%${params.query}%`;
      const search = or(
        ilike(expenses.description, needle),
        ilike(expenses.vendorName, needle),
        ilike(expenses.invoiceNo, needle),
      );
      if (search) conditions.push(search);
    }
    if (params.filters.kategori) conditions.push(eq(expenses.categoryId, params.filters.kategori));
    if (params.filters.donem) conditions.push(eq(expenses.period, params.filters.donem));
    if (params.filters.durum) {
      conditions.push(sql`${expenses.status}::text = ${params.filters.durum}`);
    }
    if (params.filters.dagitim === "bekliyor") {
      conditions.push(isNull(expenses.distributedAt));
    }
    if (params.filters.dagitim === "yapildi") {
      conditions.push(sql`${expenses.distributedAt} IS NOT NULL`);
    }

    const where = and(...conditions);
    const orderColumn =
      SORT_COLUMNS[params.sort as keyof typeof SORT_COLUMNS] ?? expenses.expenseDate;
    const orderBy = params.direction === "asc" ? asc(orderColumn) : desc(orderColumn);

    const rows = await tx
      .select({
        id: expenses.id,
        description: expenses.description,
        vendorName: expenses.vendorName,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        categoryColor: expenseCategories.color,
        amountKurus: expenses.amountKurus,
        vatKurus: expenses.vatKurus,
        withholdingKurus: expenses.withholdingKurus,
        invoiceNo: expenses.invoiceNo,
        expenseDate: expenses.expenseDate,
        paidAt: expenses.paidAt,
        status: expenses.status,
        distributedAt: expenses.distributedAt,
        period: expenses.period,
        attachmentUrl: expenses.attachmentUrl,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(where)
      .orderBy(orderBy, asc(expenses.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const [totalRow] = await tx
      .select({ value: sql<number>`COUNT(*)` })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(where);

    const categoryRows = await tx
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        depth: expenseCategories.depth,
        color: expenseCategories.color,
      })
      .from(expenseCategories)
      .where(and(isNull(expenseCategories.deletedAt), eq(expenseCategories.isActive, true)))
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));

    const periodRows = await tx
      .selectDistinct({ period: expenses.period })
      .from(expenses)
      .where(and(isNull(expenses.deletedAt), sql`${expenses.period} IS NOT NULL`))
      .orderBy(desc(expenses.period))
      .limit(24);

    const [totals] = await tx
      .select({
        month: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.expenseDate} >= date_trunc('month', now())
          THEN ${expenses.amountKurus} ELSE 0 END), 0)`,
        year: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.expenseDate} >= date_trunc('year', now())
          THEN ${expenses.amountKurus} ELSE 0 END), 0)`,
        pending: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.status} = 'pending_approval'
          THEN ${expenses.amountKurus} ELSE 0 END), 0)`,
        undistributed: sql<number>`COALESCE(SUM(CASE WHEN ${expenses.distributedAt} IS NULL
          AND ${expenses.status} IN ('approved','paid') THEN ${expenses.amountKurus} ELSE 0 END), 0)`,
      })
      .from(expenses)
      .where(isNull(expenses.deletedAt));

    const categoryBreakdown = await tx
      .select({
        name: sql<string>`COALESCE(${expenseCategories.name}, '—')`,
        amountKurus: sql<number>`SUM(${expenses.amountKurus})`,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
      .where(
        and(
          isNull(expenses.deletedAt),
          sql`${expenses.expenseDate} >= date_trunc('year', now())`,
        ),
      )
      .groupBy(expenseCategories.name)
      .orderBy(desc(sql`SUM(${expenses.amountKurus})`))
      .limit(6);

    return {
      rows,
      total: Number(totalRow?.value ?? 0),
      categories: categoryRows,
      periods: periodRows
        .map((row) => row.period)
        .filter((period): period is string => period !== null),
      totals: {
        monthKurus: Number(totals?.month ?? 0),
        yearKurus: Number(totals?.year ?? 0),
        pendingKurus: Number(totals?.pending ?? 0),
        undistributedKurus: Number(totals?.undistributed ?? 0),
      },
      byCategory: categoryBreakdown.map((row) => ({
        name: row.name,
        amountKurus: Number(row.amountKurus),
      })),
    };
  });
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  distribution: string;
  isShared: boolean;
  icon: string | null;
  color: string | null;
  defaultVatRate: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Bu kategoriye yazılmış gider sayısı — silme kararında gösterilir. */
  expenseCount: number;
  totalKurus: number;
  children: CategoryTreeNode[];
}

/** Kategori ağacı (iki seviye) + kullanım sayaçları. */
export async function getCategoryTree(ctx: AppContext): Promise<CategoryTreeNode[]> {
  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        parentId: expenseCategories.parentId,
        depth: expenseCategories.depth,
        distribution: expenseCategories.distribution,
        isShared: expenseCategories.isShared,
        icon: expenseCategories.icon,
        color: expenseCategories.color,
        defaultVatRate: expenseCategories.defaultVatRate,
        isActive: expenseCategories.isActive,
        sortOrder: expenseCategories.sortOrder,
        expenseCount: sql<number>`(
          SELECT COUNT(*) FROM expenses e
          WHERE e.category_id = ${expenseCategories.id} AND e.deleted_at IS NULL
        )`,
        totalKurus: sql<number>`COALESCE((
          SELECT SUM(e.amount_kurus) FROM expenses e
          WHERE e.category_id = ${expenseCategories.id} AND e.deleted_at IS NULL
        ), 0)`,
      })
      .from(expenseCategories)
      .where(isNull(expenseCategories.deletedAt))
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name)),
  );

  const nodes = rows.map((row) => ({
    ...row,
    expenseCount: Number(row.expenseCount),
    totalKurus: Number(row.totalKurus),
    children: [] as CategoryTreeNode[],
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export interface ExpenseDetail {
  expense: typeof expenses.$inferSelect;
  categoryName: string | null;
  categoryDistribution: string | null;
  /** Bu giderden doğan borçlar (dağıtıldıysa). */
  generatedDebts: { unitNumber: string; amountKurus: number; status: string }[];
}

export async function getExpenseDetail(
  ctx: AppContext,
  expenseId: string,
): Promise<ExpenseDetail | null> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [expense] = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);
    if (!expense) return null;

    const [category] = expense.categoryId
      ? await tx
          .select({
            name: expenseCategories.name,
            distribution: expenseCategories.distribution,
          })
          .from(expenseCategories)
          .where(eq(expenseCategories.id, expense.categoryId))
          .limit(1)
      : [];

    // Dağıtımdan doğan borçlar `metadata.sourceExpenseId` ile işaretli.
    const debtRows = await tx.execute<{
      number: string;
      amount_kurus: number;
      status: string;
    }>(sql`
      SELECT u.number, d.amount_kurus, d.status
      FROM debts d
      JOIN units u ON u.id = d.unit_id
      WHERE d.deleted_at IS NULL
        AND d.metadata->>'sourceExpenseId' = ${expenseId}
      ORDER BY u.number
    `);

    return {
      expense,
      categoryName: category?.name ?? null,
      categoryDistribution: category?.distribution ?? null,
      generatedDebts: (debtRows as unknown as { number: string; amount_kurus: number; status: string }[]).map(
        (row) => ({
          unitNumber: row.number,
          amountKurus: Number(row.amount_kurus),
          status: row.status,
        }),
      ),
    };
  });
}
