import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  CategoryTreeNode,
  ExpenseListQuery,
  ExpenseListResponse,
} from "@yonetim/contracts";
import { toPageMeta } from "@yonetim/contracts";
import { expenseCategories, expenses } from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Gider repository — SQL yalnız burada.
 * `apps/app/src/lib/queries/expenses.ts`'ten taşındı.
 */
const SORT_COLUMNS = {
  expenseDate: expenses.expenseDate,
  amount: expenses.amountKurus,
  category: expenseCategories.name,
  vendor: expenses.vendorName,
  status: expenses.status,
} as const;

@Injectable()
export class ExpenseRepository {
  constructor(private readonly db: DbService) {}

  async list(q: ExpenseListQuery): Promise<ExpenseListResponse> {
    return this.db.tx(async (tx) => {
      const where = this.listWhere(q);
      const orderColumn = SORT_COLUMNS[q.sort] ?? expenses.expenseDate;
      const orderBy = q.dir === "asc" ? asc(orderColumn) : desc(orderColumn);

      const [
        rows,
        totalRow,
        categoryRows,
        periodRows,
        totals,
        categoryBreakdown,
      ] = await Promise.all([
        tx
          .select({
            id: expenses.id,
            description: expenses.description,
            vendorName: expenses.vendorName,
            categoryId: expenses.categoryId,
            categoryName: expenseCategories.name,
            categoryColor: expenseCategories.color,
            amountMinor: expenses.amountKurus,
            vatMinor: expenses.vatKurus,
            withholdingMinor: expenses.withholdingKurus,
            invoiceNo: expenses.invoiceNo,
            expenseDate: expenses.expenseDate,
            paidAt: expenses.paidAt,
            status: expenses.status,
            distributedAt: expenses.distributedAt,
            period: expenses.period,
            attachmentUrl: expenses.attachmentUrl,
          })
          .from(expenses)
          .leftJoin(
            expenseCategories,
            eq(expenseCategories.id, expenses.categoryId),
          )
          .where(where)
          .orderBy(orderBy, asc(expenses.id))
          .limit(q.perPage)
          .offset((q.page - 1) * q.perPage),

        tx
          .select({ value: sql<number>`COUNT(*)` })
          .from(expenses)
          .leftJoin(
            expenseCategories,
            eq(expenseCategories.id, expenses.categoryId),
          )
          .where(where),

        tx
          .select({
            id: expenseCategories.id,
            name: expenseCategories.name,
            depth: expenseCategories.depth,
            color: expenseCategories.color,
          })
          .from(expenseCategories)
          .where(
            and(
              isNull(expenseCategories.deletedAt),
              eq(expenseCategories.isActive, true),
            ),
          )
          .orderBy(
            asc(expenseCategories.sortOrder),
            asc(expenseCategories.name),
          ),

        tx
          .selectDistinct({ period: expenses.period })
          .from(expenses)
          .where(
            and(
              isNull(expenses.deletedAt),
              sql`${expenses.period} IS NOT NULL`,
            ),
          )
          .orderBy(desc(expenses.period))
          .limit(24),

        tx
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
          .where(isNull(expenses.deletedAt)),

        tx
          .select({
            name: sql<string>`COALESCE(${expenseCategories.name}, '—')`,
            amountMinor: sql<number>`SUM(${expenses.amountKurus})`,
          })
          .from(expenses)
          .leftJoin(
            expenseCategories,
            eq(expenseCategories.id, expenses.categoryId),
          )
          .where(
            and(
              isNull(expenses.deletedAt),
              sql`${expenses.expenseDate} >= date_trunc('year', now())`,
            ),
          )
          .groupBy(expenseCategories.name)
          .orderBy(desc(sql`SUM(${expenses.amountKurus})`))
          .limit(6),
      ]);

      return {
        rows,
        meta: toPageMeta(q.page, q.perPage, Number(totalRow[0]?.value ?? 0)),
        facets: {
          categories: categoryRows,
          periods: periodRows
            .map((row) => row.period)
            .filter((period): period is string => period !== null),
        },
        totals: {
          monthMinor: Number(totals[0]?.month ?? 0),
          yearMinor: Number(totals[0]?.year ?? 0),
          pendingMinor: Number(totals[0]?.pending ?? 0),
          undistributedMinor: Number(totals[0]?.undistributed ?? 0),
        },
        byCategory: categoryBreakdown.map((row) => ({
          name: row.name,
          amountMinor: Number(row.amountMinor),
        })),
      };
    });
  }

  private listWhere(q: ExpenseListQuery): SQL | undefined {
    const conditions: SQL[] = [
      q.trashed
        ? sql`${expenses.deletedAt} IS NOT NULL`
        : isNull(expenses.deletedAt),
    ];

    if (q.search) {
      const needle = `%${q.search}%`;
      const search = or(
        ilike(expenses.description, needle),
        ilike(expenses.vendorName, needle),
        ilike(expenses.invoiceNo, needle),
      );
      if (search) conditions.push(search);
    }
    if (q.categoryId) conditions.push(eq(expenses.categoryId, q.categoryId));
    if (q.period) conditions.push(eq(expenses.period, q.period));
    if (q.status) conditions.push(sql`${expenses.status}::text = ${q.status}`);
    if (q.distribution === "bekliyor")
      conditions.push(isNull(expenses.distributedAt));
    if (q.distribution === "yapildi")
      conditions.push(sql`${expenses.distributedAt} IS NOT NULL`);

    return and(...conditions);
  }

  /**
   * Kategori ağacı (iki seviye) + kullanım sayaçları.
   *
   * Sayaçlar **ayrı gruplu sorgu** ile alınıyor. Önceki sürümde bunlar kategori
   * sorgusunun içinde korelasyonlu alt sorguydu; tek tablolu sorguda Drizzle
   * sütunu niteliksiz ürettiği için (`"id"`) koşul `expenses.id`'ye bağlanıyor
   * ve sayaçlar sessizce hep 0 dönüyordu. Aynı tuzağı A1'de birim facet'inde
   * de bulmuştuk.
   */
  async categoryTree(): Promise<CategoryTreeNode[]> {
    const { rows, counts } = await this.db.tx(async (tx) => {
      const [rows, counts] = await Promise.all([
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
          })
          .from(expenseCategories)
          .where(isNull(expenseCategories.deletedAt))
          .orderBy(
            asc(expenseCategories.sortOrder),
            asc(expenseCategories.name),
          ),

        tx
          .select({
            categoryId: expenses.categoryId,
            expenseCount: sql<number>`COUNT(*)`,
            totalMinor: sql<number>`COALESCE(SUM(${expenses.amountKurus}), 0)`,
          })
          .from(expenses)
          .where(isNull(expenses.deletedAt))
          .groupBy(expenses.categoryId),
      ]);
      return { rows, counts };
    });

    const countById = new Map(counts.map((c) => [c.categoryId, c]));

    const nodes: CategoryTreeNode[] = rows.map((row) => ({
      ...row,
      expenseCount: Number(countById.get(row.id)?.expenseCount ?? 0),
      totalMinor: Number(countById.get(row.id)?.totalMinor ?? 0),
      children: [],
    }));

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: CategoryTreeNode[] = [];
    for (const node of nodes) {
      if (node.parentId && byId.has(node.parentId))
        byId.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async detail(expenseId: string) {
    return this.db.tx(async (tx) => {
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
        generatedDebts: (
          debtRows as unknown as {
            number: string;
            amount_kurus: number;
            status: string;
          }[]
        ).map((row) => ({
          unitNumber: row.number,
          amountMinor: Number(row.amount_kurus),
          status: row.status,
        })),
      };
    });
  }
}
