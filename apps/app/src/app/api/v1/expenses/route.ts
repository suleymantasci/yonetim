import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { periodKey, toIstanbul } from "@yonetim/core";
import { expenseCategories, expenses, withTenant } from "@yonetim/db";

import {
  apiError, apiList, apiOk, authenticateApi, parseJsonBody, parsePagination,
} from "@/lib/api";

/**
 * `/api/v1/expenses` — gider listesi ve oluşturma.
 *
 * Muhasebe yazılımının fatura akışını buraya bağlaması hedefleniyor: fatura
 * kaydedildiği anda gider oluşur. Bu yüzden POST varsayılan olarak
 * `pending_approval` durumunda kayıt açar — dışarıdan gelen bir kayıt
 * kendiliğinden onaylı sayılmaz, yönetici onayından geçer.
 */
export const dynamic = "force-dynamic";

const SORTS = {
  expenseDate: expenses.expenseDate,
  amount: expenses.amountKurus,
  createdAt: expenses.createdAt,
} as const;

export async function GET(request: Request) {
  try {
    const ctx = await authenticateApi(request, "expense:read");
    const url = new URL(request.url);
    const page = parsePagination(url);
    const categoryId = url.searchParams.get("categoryId");
    const period = url.searchParams.get("period");
    const status = url.searchParams.get("status");

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const conditions = [isNull(expenses.deletedAt)];
      if (page.q) {
        const needle = `%${page.q}%`;
        const search = or(
          ilike(expenses.description, needle),
          ilike(expenses.vendorName, needle),
          ilike(expenses.invoiceNo, needle),
        );
        if (search) conditions.push(search);
      }
      if (categoryId) conditions.push(eq(expenses.categoryId, categoryId));
      if (period) conditions.push(eq(expenses.period, period));
      if (status) conditions.push(sql`${expenses.status}::text = ${status}`);

      const where = and(...conditions);
      const column = SORTS[page.sort as keyof typeof SORTS] ?? expenses.expenseDate;
      const order = page.direction === "asc" ? asc(column) : desc(column);

      const rows = await tx
        .select({
          id: expenses.id,
          description: expenses.description,
          categoryId: expenses.categoryId,
          categoryName: expenseCategories.name,
          vendorName: expenses.vendorName,
          amountKurus: expenses.amountKurus,
          vatRate: expenses.vatRate,
          vatKurus: expenses.vatKurus,
          withholdingKurus: expenses.withholdingKurus,
          invoiceNo: expenses.invoiceNo,
          expenseDate: expenses.expenseDate,
          paidAt: expenses.paidAt,
          status: expenses.status,
          distributedAt: expenses.distributedAt,
          period: expenses.period,
          createdAt: expenses.createdAt,
        })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .where(where)
        .orderBy(order, asc(expenses.id))
        .limit(page.pageSize)
        .offset((page.page - 1) * page.pageSize);

      const [total] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
        .where(where);

      return { rows, total: Number(total?.value ?? 0) };
    });

    return apiList(result.rows, {
      page: page.page,
      pageSize: page.pageSize,
      total: result.total,
    });
  } catch (error) {
    return apiError(error);
  }
}

const createSchema = z.object({
  categoryId: z.string().uuid().nullish(),
  vendorName: z.string().max(160).nullish(),
  description: z.string().min(3).max(240),
  /** KDV **dahil** toplam; KDV orandan türetilir. */
  amountKurus: z.number().int().positive(),
  vatRate: z.number().min(0).max(1).default(0.2),
  withholdingKurus: z.number().int().min(0).default(0),
  invoiceNo: z.string().max(60).nullish(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attachmentUrl: z.string().url().max(500).nullish(),
});

export async function POST(request: Request) {
  try {
    const ctx = await authenticateApi(request, "expense:write");
    const input = await parseJsonBody(request, createSchema);

    const expenseDate = new Date(`${input.expenseDate}T00:00:00+03:00`);
    const istanbul = toIstanbul(expenseDate);
    const vatKurus = Math.round((input.amountKurus * input.vatRate) / (1 + input.vatRate));

    const created = await withTenant(
      ctx.tenantId,
      async (tx) => {
        const [row] = await tx
          .insert(expenses)
          .values({
            tenantId: ctx.tenantId,
            categoryId: input.categoryId ?? null,
            vendorName: input.vendorName ?? null,
            description: input.description,
            amountKurus: input.amountKurus,
            vatRate: input.vatRate.toFixed(2),
            vatKurus,
            withholdingKurus: input.withholdingKurus,
            invoiceNo: input.invoiceNo ?? null,
            expenseDate,
            attachmentUrl: input.attachmentUrl ?? null,
            // Dış kaynaktan gelen kayıt onaylı sayılmaz.
            status: "pending_approval",
            period: periodKey({
              year: istanbul.getUTCFullYear(),
              month: istanbul.getUTCMonth() + 1,
            }),
          })
          .returning();
        return row;
      },
      { userId: ctx.userId },
    );

    return apiOk(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
