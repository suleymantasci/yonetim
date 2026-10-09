import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import {
  payablesQuery,
  recurringExpenseSave,
  type PayablesResponse,
  type RecurringExpenseList,
  type RecurringExpenseSave,
} from "@yonetim/contracts";
import { expenseCategories, recurringExpenses, staff, vendors } from "@yonetim/db";
import { duePeriods, generateRecurringExpenses } from "@yonetim/jobs";

import { AuditService } from "../../governance/audit/audit.service";
import { RequirePermission } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodBodyPipe } from "../../infra/zod/zod-dto";
import { istanbulEnd, istanbulStart } from "../accounting/accounting.service";

type Row = Record<string, unknown>;

/** Ödenecekler ve tekrarlayan faturalar. */
@Injectable()
export class PayablesService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(q: { party: string; state: string; from?: string; to?: string }): Promise<PayablesResponse> {
    const partySql =
      q.party === "vendor"
        ? sql`AND e.vendor_id IS NOT NULL`
        : q.party === "staff"
          ? sql`AND e.staff_id IS NOT NULL`
          : q.party === "expense"
            ? sql`AND e.vendor_id IS NULL AND e.staff_id IS NULL`
            : sql``;
    const paid = sql`(e.status = 'paid' OR e.paid_at IS NOT NULL)`;
    const stateSql = q.state === "pending" ? sql`AND NOT ${paid}` : q.state === "paid" ? sql`AND ${paid}` : sql``;
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT e.id, e.description, e.expense_date, e.invoice_no, e.amount_kurus, e.paid_at, ${paid} AS paid,
               e.vendor_id, e.staff_id, e.recurring_id IS NOT NULL AS recurring,
               COALESCE(v.name, e.vendor_name) AS vendor_name, s.full_name AS staff_name, c.name AS category
        FROM expenses e
        LEFT JOIN vendors v ON v.id = e.vendor_id
        LEFT JOIN staff s ON s.id = e.staff_id
        LEFT JOIN expense_categories c ON c.id = e.category_id
        WHERE e.deleted_at IS NULL AND e.status IN ('approved', 'paid', 'pending_approval') ${partySql} ${stateSql}
          ${q.from ? sql`AND e.expense_date >= ${istanbulStart(q.from).toISOString()}::timestamptz` : sql``}
          ${q.to ? sql`AND e.expense_date <= ${istanbulEnd(q.to).toISOString()}::timestamptz` : sql``}
        ORDER BY ${paid}, e.expense_date
        LIMIT 1000
      `)) as unknown as Row[],
    );
    const list = rows.map((r) => ({
      id: String(r.id),
      party: (r.vendor_id ? "vendor" : r.staff_id ? "staff" : "expense") as "vendor" | "staff" | "expense",
      partyName: r.vendor_id || r.vendor_name ? (r.vendor_name ? String(r.vendor_name) : null) : r.staff_name ? String(r.staff_name) : null,
      category: r.category ? String(r.category) : null,
      description: String(r.description),
      date: new Date(String(r.expense_date)),
      invoiceNo: r.invoice_no ? String(r.invoice_no) : null,
      amountMinor: Number(r.amount_kurus),
      paid: r.paid === true,
      paidAt: r.paid_at ? new Date(String(r.paid_at)) : null,
      recurring: r.recurring === true,
    }));
    return {
      rows: list,
      totals: {
        pendingMinor: list.filter((r) => !r.paid).reduce((s, r) => s + r.amountMinor, 0),
        paidMinor: list.filter((r) => r.paid).reduce((s, r) => s + r.amountMinor, 0),
      },
    };
  }

  async recurring(): Promise<RecurringExpenseList> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          r: recurringExpenses,
          categoryName: expenseCategories.name,
          vendorName: vendors.name,
          staffName: staff.fullName,
          generated: sql<number>`(SELECT COUNT(*)::int FROM expenses x WHERE x.recurring_id = recurring_expenses.id AND x.deleted_at IS NULL)`,
        })
        .from(recurringExpenses)
        .leftJoin(expenseCategories, eq(expenseCategories.id, recurringExpenses.categoryId))
        .leftJoin(vendors, eq(vendors.id, recurringExpenses.vendorId))
        .leftJoin(staff, eq(staff.id, recurringExpenses.staffId))
        .where(isNull(recurringExpenses.deletedAt))
        .orderBy(asc(recurringExpenses.dayOfMonth), asc(recurringExpenses.description));
      const [categories, vendorRows, staffRows] = await Promise.all([
        tx.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(isNull(expenseCategories.deletedAt)).orderBy(asc(expenseCategories.name)),
        tx.select({ id: vendors.id, name: vendors.name }).from(vendors).where(isNull(vendors.deletedAt)).orderBy(asc(vendors.name)),
        tx.select({ id: staff.id, name: staff.fullName }).from(staff).where(isNull(staff.deletedAt)).orderBy(asc(staff.fullName)),
      ]);
      return {
        rows: rows.map(({ r, categoryName, vendorName, staffName, generated }) => ({
          id: r.id,
          description: r.description,
          categoryId: r.categoryId,
          categoryName,
          vendorId: r.vendorId,
          vendorName,
          staffId: r.staffId,
          staffName,
          amountMinor: r.amountKurus,
          vatRate: Number(r.vatRate),
          dayOfMonth: r.dayOfMonth,
          startPeriod: r.startPeriod,
          endPeriod: r.endPeriod,
          lastPeriod: r.lastPeriod,
          isActive: r.isActive,
          generated: Number(generated),
          nextDate: r.isActive ? nextDate(r) : null,
        })),
        options: { categories, vendors: vendorRows, staff: staffRows },
      };
    });
  }

  async create(dto: RecurringExpenseSave) {
    const [row] = await this.db.tx((tx) =>
      tx.insert(recurringExpenses).values({ tenantId: this.db.ctx().tenantId, ...cols(dto) }).returning({ id: recurringExpenses.id }),
    );
    await this.audit.record({ action: "recurring_expense_created", resource: "recurring_expense", resourceId: row!.id });
    return { id: row!.id };
  }

  async update(id: string, dto: RecurringExpenseSave) {
    const rows = await this.db.tx((tx) =>
      tx
        .update(recurringExpenses)
        .set({ ...cols(dto), updatedAt: new Date() })
        .where(and(eq(recurringExpenses.id, id), isNull(recurringExpenses.deletedAt)))
        .returning({ id: recurringExpenses.id }),
    );
    if (rows.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "recurring_expense_updated", resource: "recurring_expense", resourceId: id });
    return { id };
  }

  async remove(id: string) {
    const rows = await this.db.tx((tx) =>
      tx
        .update(recurringExpenses)
        .set({ deletedAt: new Date(), isActive: false })
        .where(and(eq(recurringExpenses.id, id), isNull(recurringExpenses.deletedAt)))
        .returning({ id: recurringExpenses.id }),
    );
    if (rows.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "recurring_expense_deleted", resource: "recurring_expense", resourceId: id });
    return { id };
  }

  /** Vadesi gelmiş dönemleri şimdi üret (iş beklemeden). */
  async runNow(id: string) {
    const result = await generateRecurringExpenses({ tenantId: this.db.ctx().tenantId, onlyId: id });
    await this.audit.record({ action: "recurring_expense_run", resource: "recurring_expense", resourceId: id, reason: `${result.created} kayıt` });
    return { created: result.created };
  }
}

function cols(dto: RecurringExpenseSave) {
  return {
    description: dto.description,
    categoryId: dto.categoryId ?? null,
    vendorId: dto.vendorId ?? null,
    staffId: dto.staffId ?? null,
    amountKurus: dto.amountMinor,
    vatRate: String(dto.vatRate),
    dayOfMonth: dto.dayOfMonth,
    startPeriod: dto.startPeriod,
    endPeriod: dto.endPeriod ?? null,
    isActive: dto.isActive,
  };
}

/** Sıradaki üretim günü: son üretilen dönemden sonraki ilk dönemin günü. */
function nextDate(r: { startPeriod: string; endPeriod: string | null; lastPeriod: string | null; dayOfMonth: number }): string | null {
  // "Çok uzak gelecek" itibarıyla vadesi gelenlerden ilki = sıradaki dönem.
  const all = duePeriods(r, new Date("2100-01-01T00:00:00Z"));
  const next = all[0];
  return next ? `${next}-${String(r.dayOfMonth).padStart(2, "0")}` : null;
}

/** `/v1/panel/payables` — ödenecekler ve tekrarlayan faturalar. */
@ApiTags("panel/payables")
@Controller("v1/panel/payables")
export class PayablesController {
  constructor(private readonly service: PayablesService) {}

  @Get()
  @RequirePermission("expense:read")
  @ApiOperation({ summary: "Ödenecekler (gider/firma/personel; bekleyen/ödenmiş)" })
  list(@Query() query: Record<string, string>) {
    return this.service.list(payablesQuery.parse(query));
  }

  @Get("recurring")
  @RequirePermission("expense:read")
  recurring() {
    return this.service.recurring();
  }

  @Post("recurring")
  @RequirePermission("expense:write")
  create(@Body(new ZodBodyPipe(recurringExpenseSave)) dto: RecurringExpenseSave) {
    return this.service.create(dto);
  }

  @Patch("recurring/:id")
  @RequirePermission("expense:write")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodBodyPipe(recurringExpenseSave)) dto: RecurringExpenseSave) {
    return this.service.update(id, dto);
  }

  @Delete("recurring/:id")
  @RequirePermission("expense:write")
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post("recurring/:id/run")
  @RequirePermission("expense:write")
  @ApiOperation({ summary: "Vadesi gelmiş dönemleri şimdi üret" })
  run(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.runNow(id);
  }
}
