import { BadRequestException, Controller, Get, Injectable, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql, type SQL } from "drizzle-orm";

import {
  accountCodesResponse,
  cashDaysQuery,
  collectionReportQuery,
  debtRunQuery,
  expenseReportQuery,
  memberNotesQuery,
  monthlyReportQuery,
  type AccountCodesResponse,
  type CashDaysResponse,
  type CollectionReportQuery,
  type CollectionReportResponse,
  type DebtRunDetailResponse,
  type DebtRunQuery,
  type DebtRunResponse,
  type ExpenseReportQuery,
  type ExpenseReportResponse,
  type MemberNotesResponse,
  type MonthlyReportResponse,
} from "@yonetim/contracts";

import { RequirePermission } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodQueryPipe } from "../../infra/zod/zod-dto";
import { istanbulEnd, istanbulStart } from "../accounting/accounting.service";
import { isCashCode, loadJournal, parentOf } from "../accounting/journal";
import { cashDays } from "./cash-days";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const UNIT_LABEL = sql`CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END`;
const PERSON = (alias: string) => sql.raw(`nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), '')`);
const ISTANBUL_DAY = (col: string) => sql.raw(`to_char(${col} AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD')`);

function checkRange(from: string, to: string, maxDays = 366) {
  if (from > to) throw new BadRequestException("validation_failed:range_order");
  if ((istanbulStart(to).getTime() - istanbulStart(from).getTime()) / 86_400_000 > maxDays)
    throw new BadRequestException("validation_failed:range_too_long");
}

/** Borçlandırma kimliği: tür + dönem + açıklama + vade günü (toplu borçlandırmanın tek satırı). */
const BATCH_KEY = sql`md5(coalesce(d.debt_type_id::text, d.kind::text) || '|' || coalesce(d.period, '') || '|' || d.description || '|' || ${ISTANBUL_DAY("d.due_date")})`;

/**
 * Y6 — Yönetimcell'deki ek raporlar. Hepsi salt okuma; tutarlar kuruş.
 * Kasa günlükleri yevmiye fişlerinden (mizanla aynı kaynak), diğerleri
 * doğrudan tablolardan.
 */
@Injectable()
export class ExtraReportsService {
  constructor(private readonly db: DbService) {}

  async collections(q: CollectionReportQuery): Promise<CollectionReportResponse> {
    checkRange(q.from, q.to);
    const from = istanbulStart(q.from).toISOString();
    const to = istanbulEnd(q.to).toISOString();
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    const accountSql = (cashCol: SQL, bankCol: SQL) =>
      !q.account ? sql`` : q.account === "cash" ? sql`AND ${cashCol}` : sql`AND ${bankCol} = ${q.account}::uuid`;
    return this.db.tx(async (tx) => {
      const member =
        q.kind === "external"
          ? []
          : ((await tx.execute(sql`
              SELECT p.id, coalesce(p.paid_at, p.created_at) AS at, p.receipt_no, p.method::text AS method,
                     p.bank_account_id, ba.bank_name, ${UNIT_LABEL} AS unit_label,
                     coalesce(${PERSON("pu")}, ${PERSON("du")}) AS name,
                     (SELECT string_agg(d.description, ', ' ORDER BY d.due_date) FROM payment_allocations a JOIN debts d ON d.id = a.debt_id WHERE a.payment_id = p.id) AS description,
                     p.amount_kurus - p.refunded_kurus AS amount
              FROM payments p
              LEFT JOIN units u ON u.id = p.unit_id
              LEFT JOIN blocks b ON b.id = u.block_id
              LEFT JOIN bank_accounts ba ON ba.id = p.bank_account_id
              LEFT JOIN users pu ON pu.id = p.payer_user_id
              LEFT JOIN users du ON du.id = p.debtor_user_id
              WHERE p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance')
                AND coalesce(p.paid_at, p.created_at) BETWEEN ${from}::timestamptz AND ${to}::timestamptz
                ${q.blockId ? sql`AND u.block_id = ${q.blockId}::uuid` : sql``}
                ${accountSql(sql`p.bank_account_id IS NULL AND p.method = 'cash'`, sql`p.bank_account_id`)}
                ${like ? sql`AND (p.receipt_no ILIKE ${like} OR EXISTS (SELECT 1 FROM payment_allocations a JOIN debts d ON d.id = a.debt_id WHERE a.payment_id = p.id AND d.description ILIKE ${like}))` : sql``}
            `)) as unknown as Row[]);
      const external =
        q.kind === "member" || q.blockId
          ? []
          : ((await tx.execute(sql`
              SELECT m.id, m.movement_date AS at, m.document_no AS receipt_no, m.to_account AS account, m.to_bank_account_id,
                     ba.bank_name, m.payer_name AS name, concat_ws(' · ', g.name, m.description) AS description, m.amount_kurus AS amount
              FROM cash_movements m
              LEFT JOIN income_groups g ON g.id = m.income_group_id
              LEFT JOIN bank_accounts ba ON ba.id = m.to_bank_account_id
              WHERE m.kind = 'income' AND m.voided_at IS NULL
                AND m.movement_date BETWEEN ${from}::timestamptz AND ${to}::timestamptz
                ${accountSql(sql`m.to_account = 'cash'`, sql`m.to_bank_account_id`)}
                ${like ? sql`AND (m.document_no ILIKE ${like} OR m.description ILIKE ${like} OR m.payer_name ILIKE ${like})` : sql``}
            `)) as unknown as Row[]);
      const [blocks, accounts] = await Promise.all([
        tx.execute(sql`SELECT id, name FROM blocks WHERE deleted_at IS NULL ORDER BY name`),
        tx.execute(sql`SELECT id, concat_ws(' · ', bank_name, account_name) AS label FROM bank_accounts WHERE deleted_at IS NULL ORDER BY created_at`),
      ]);
      const rows = [
        ...member.map((r) => ({
          id: String(r.id),
          kind: "member" as const,
          date: new Date(String(r.at)),
          receiptNo: s(r.receipt_no),
          account: r.bank_account_id ? String(r.bank_name ?? "Banka") : r.method === "cash" ? "Kasa" : "Banka",
          unitLabel: s(r.unit_label),
          name: s(r.name),
          description: s(r.description),
          amountMinor: n(r.amount),
        })),
        ...external.map((r) => ({
          id: String(r.id),
          kind: "external" as const,
          date: new Date(String(r.at)),
          receiptNo: s(r.receipt_no),
          account: r.account === "cash" ? "Kasa" : String(r.bank_name ?? "Banka"),
          unitLabel: null,
          name: s(r.name),
          description: s(r.description),
          amountMinor: n(r.amount),
        })),
      ].sort((a, b) => a.date.getTime() - b.date.getTime());
      const memberMinor = rows.filter((r) => r.kind === "member").reduce((a, r) => a + r.amountMinor, 0);
      const externalMinor = rows.filter((r) => r.kind === "external").reduce((a, r) => a + r.amountMinor, 0);
      return {
        rows,
        totals: { memberMinor, externalMinor, totalMinor: memberMinor + externalMinor },
        options: {
          blocks: (blocks as unknown as Row[]).map((b) => ({ id: String(b.id), name: String(b.name) })),
          accounts: (accounts as unknown as Row[]).map((b) => ({ id: String(b.id), label: String(b.label) })),
        },
      };
    });
  }

  async expenses(q: ExpenseReportQuery): Promise<ExpenseReportResponse> {
    checkRange(q.from, q.to);
    const paid = sql`(e.status = 'paid' OR e.paid_at IS NOT NULL)`;
    return this.db.tx(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT e.id, e.expense_date, e.category_id, c.name AS category, e.vendor_id, e.staff_id,
               COALESCE(v.name, e.vendor_name) AS vendor_name, st.full_name AS staff_name,
               e.description, e.invoice_no, e.amount_kurus, ${paid} AS paid
        FROM expenses e
        LEFT JOIN expense_categories c ON c.id = e.category_id
        LEFT JOIN vendors v ON v.id = e.vendor_id
        LEFT JOIN staff st ON st.id = e.staff_id
        WHERE e.deleted_at IS NULL AND e.status IN ('approved', 'paid')
          AND e.expense_date BETWEEN ${istanbulStart(q.from).toISOString()}::timestamptz AND ${istanbulEnd(q.to).toISOString()}::timestamptz
          ${q.categoryId ? sql`AND e.category_id = ${q.categoryId}::uuid` : sql``}
          ${q.vendorId ? sql`AND e.vendor_id = ${q.vendorId}::uuid` : sql``}
          ${q.party === "vendor" ? sql`AND (e.vendor_id IS NOT NULL OR e.vendor_name IS NOT NULL)` : q.party === "staff" ? sql`AND e.staff_id IS NOT NULL` : q.party === "expense" ? sql`AND e.vendor_id IS NULL AND e.vendor_name IS NULL AND e.staff_id IS NULL` : sql``}
          ${q.state === "paid" ? sql`AND ${paid}` : q.state === "unpaid" ? sql`AND NOT ${paid}` : sql``}
        ORDER BY e.expense_date, e.created_at
        LIMIT 5000
      `)) as unknown as Row[];
      const [cats, vendorsRows] = await Promise.all([
        tx.execute(sql`SELECT id, name FROM expense_categories WHERE deleted_at IS NULL ORDER BY name`),
        tx.execute(sql`SELECT id, name FROM vendors WHERE deleted_at IS NULL ORDER BY name`),
      ]);
      const list = rows.map((r) => ({
        id: String(r.id),
        date: new Date(String(r.expense_date)),
        category: s(r.category),
        categoryId: s(r.category_id),
        party: (r.vendor_id || r.vendor_name ? "vendor" : r.staff_id ? "staff" : "expense") as "vendor" | "staff" | "expense",
        partyName: s(r.vendor_name) ?? s(r.staff_name),
        description: String(r.description),
        invoiceNo: s(r.invoice_no),
        amountMinor: n(r.amount_kurus),
        paid: r.paid === true,
      }));
      const groups = new Map<string, { categoryId: string | null; name: string | null; count: number; amountMinor: number; paidMinor: number }>();
      for (const r of list) {
        const key = r.categoryId ?? "";
        const g = groups.get(key) ?? { categoryId: r.categoryId, name: r.category, count: 0, amountMinor: 0, paidMinor: 0 };
        g.count += 1;
        g.amountMinor += r.amountMinor;
        if (r.paid) g.paidMinor += r.amountMinor;
        groups.set(key, g);
      }
      return {
        rows: list.map(({ categoryId: _c, ...r }) => r),
        groups: [...groups.values()].sort((a, b) => b.amountMinor - a.amountMinor),
        totals: {
          amountMinor: list.reduce((a, r) => a + r.amountMinor, 0),
          paidMinor: list.filter((r) => r.paid).reduce((a, r) => a + r.amountMinor, 0),
        },
        options: {
          categories: (cats as unknown as Row[]).map((c) => ({ id: String(c.id), name: String(c.name) })),
          vendors: (vendorsRows as unknown as Row[]).map((c) => ({ id: String(c.id), name: String(c.name) })),
        },
      };
    });
  }

  async cashDays(q: { from: string; to: string; account?: string }): Promise<CashDaysResponse> {
    checkRange(q.from, q.to, 62);
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, istanbulEnd(q.to));
      const accounts = [...journal.accounts.entries()]
        .filter(([code]) => isCashCode(code) && code !== "102")
        .sort(([a], [b]) => a.localeCompare(b, "tr", { numeric: true }))
        .map(([code, label]) => ({ code, label }));
      const account = q.account && accounts.some((a) => a.code === q.account) ? q.account : undefined;
      return { ...cashDays(journal, q.from, q.to, account), accounts };
    });
  }

  async monthly(period: string): Promise<MonthlyReportResponse> {
    const [y, m] = period.split("-").map(Number) as [number, number];
    const first = `${period}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const from = istanbulStart(first).toISOString();
    const to = istanbulEnd(last).toISOString();
    return this.db.tx(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT u.id, ${UNIT_LABEL} AS unit_label,
               (SELECT nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '')
                  FROM unit_occupancies o JOIN users us ON us.id = o.user_id
                 WHERE o.unit_id = u.id AND (o.end_date IS NULL OR o.end_date > now())
                 ORDER BY CASE o.relation WHEN 'owner' THEN 0 ELSE 1 END, o.created_at LIMIT 1) AS holder,
               (SELECT coalesce(sum(d.amount_kurus), 0) FROM debts d
                 WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status NOT IN ('cancelled')
                   AND d.due_date BETWEEN ${from}::timestamptz AND ${to}::timestamptz) AS accrued,
               (SELECT coalesce(sum(p.amount_kurus - p.refunded_kurus), 0) FROM payments p
                 WHERE p.unit_id = u.id AND p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance')
                   AND coalesce(p.paid_at, p.created_at) BETWEEN ${from}::timestamptz AND ${to}::timestamptz) AS collected,
               (SELECT coalesce(sum(greatest(d.amount_kurus + d.late_fee_kurus - d.paid_kurus, 0)), 0) FROM debts d
                 WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status NOT IN ('cancelled', 'written_off', 'paid')
                   AND d.due_date <= ${to}::timestamptz) AS remaining
        FROM units u LEFT JOIN blocks b ON b.id = u.block_id
        WHERE u.deleted_at IS NULL
        ORDER BY b.name NULLS FIRST, u.number
      `)) as unknown as Row[];
      const [tot] = (await tx.execute(sql`
        SELECT
          (SELECT coalesce(sum(amount_kurus), 0) FROM cash_movements WHERE kind = 'income' AND voided_at IS NULL
             AND movement_date BETWEEN ${from}::timestamptz AND ${to}::timestamptz) AS external,
          (SELECT coalesce(sum(amount_kurus), 0) FROM expenses WHERE deleted_at IS NULL AND status IN ('approved', 'paid')
             AND expense_date BETWEEN ${from}::timestamptz AND ${to}::timestamptz) AS expense,
          (SELECT coalesce(sum(amount_kurus), 0) FROM expenses WHERE deleted_at IS NULL AND paid_at IS NOT NULL
             AND paid_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz) AS expense_paid
      `)) as unknown as Row[];
      const list = rows.map((r) => ({
        unitId: String(r.id),
        unitLabel: String(r.unit_label),
        holder: s(r.holder),
        accruedMinor: n(r.accrued),
        collectedMinor: n(r.collected),
        remainingMinor: n(r.remaining),
      }));
      return {
        period,
        rows: list,
        totals: {
          accruedMinor: list.reduce((a, r) => a + r.accruedMinor, 0),
          collectedMinor: list.reduce((a, r) => a + r.collectedMinor, 0),
          remainingMinor: list.reduce((a, r) => a + r.remainingMinor, 0),
          externalMinor: n(tot?.external),
          expenseMinor: n(tot?.expense),
          expensePaidMinor: n(tot?.expense_paid),
        },
      };
    });
  }

  private debtFilter(q: DebtRunQuery) {
    return sql`d.deleted_at IS NULL AND d.status <> 'cancelled' AND d.parent_debt_id IS NULL
      ${q.typeId ? sql`AND d.debt_type_id = ${q.typeId}::uuid` : sql``}
      ${q.period ? sql`AND d.period = ${q.period}` : q.year ? sql`AND d.period LIKE ${`${q.year}-%`}` : sql``}
      ${q.from ? sql`AND d.created_at >= ${istanbulStart(q.from).toISOString()}::timestamptz` : sql``}
      ${q.to ? sql`AND d.created_at <= ${istanbulEnd(q.to).toISOString()}::timestamptz` : sql``}
      ${q.batch ? sql`AND ${BATCH_KEY} = ${q.batch}` : sql``}`;
  }

  async debtRuns(q: DebtRunQuery): Promise<DebtRunResponse> {
    return this.db.tx(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT ${BATCH_KEY} AS key, min(d.created_at) AS created_at, coalesce(max(t.name), max(d.kind::text)) AS type_name,
               d.period, d.description, ${ISTANBUL_DAY("d.due_date")} AS due_day,
               count(*) AS cnt, count(DISTINCT d.unit_id) AS units,
               sum(d.amount_kurus) AS amount, sum(least(d.paid_kurus, d.amount_kurus)) AS paid
        FROM debts d LEFT JOIN debt_types t ON t.id = d.debt_type_id
        WHERE ${this.debtFilter(q)}
        GROUP BY 1, d.period, d.description, 6
        ORDER BY min(d.created_at) DESC
        LIMIT 500
      `)) as unknown as Row[];
      const types = (await tx.execute(sql`SELECT id, name FROM debt_types WHERE deleted_at IS NULL ORDER BY sort_order, name`)) as unknown as Row[];
      return {
        batches: rows.map((r) => ({
          key: String(r.key),
          createdAt: new Date(String(r.created_at)),
          typeName: String(r.type_name),
          period: s(r.period),
          description: String(r.description),
          dueDate: String(r.due_day),
          count: n(r.cnt),
          unitCount: n(r.units),
          amountMinor: n(r.amount),
          paidMinor: n(r.paid),
          remainingMinor: n(r.amount) - n(r.paid),
        })),
        types: types.map((t) => ({ id: String(t.id), name: String(t.name) })),
      };
    });
  }

  async debtRunDetail(q: DebtRunQuery): Promise<DebtRunDetailResponse> {
    const LIMIT = 3000;
    return this.db.tx(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT d.id, d.created_at, ${UNIT_LABEL} AS unit_label, ${PERSON("du")} AS debtor, coalesce(t.name, d.kind::text) AS type_name,
               d.period, d.description, d.late_fee_kurus, ${ISTANBUL_DAY("d.due_date")} AS due_day,
               d.amount_kurus, least(d.paid_kurus, d.amount_kurus) AS paid, d.status::text AS status
        FROM debts d
        JOIN units u ON u.id = d.unit_id
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN users du ON du.id = d.debtor_user_id
        LEFT JOIN debt_types t ON t.id = d.debt_type_id
        WHERE ${this.debtFilter(q)}
        ORDER BY d.created_at DESC, b.name NULLS FIRST, u.number
        LIMIT ${LIMIT + 1}
      `)) as unknown as Row[];
      const list = rows.slice(0, LIMIT).map((r) => ({
        id: String(r.id),
        createdAt: new Date(String(r.created_at)),
        unitLabel: String(r.unit_label),
        debtorName: s(r.debtor),
        typeName: String(r.type_name),
        period: s(r.period),
        description: String(r.description),
        lateFeeMinor: n(r.late_fee_kurus),
        dueDate: String(r.due_day),
        amountMinor: n(r.amount_kurus),
        paidMinor: n(r.paid),
        remainingMinor: n(r.amount_kurus) - n(r.paid),
        status: String(r.status),
      }));
      return {
        rows: list,
        totals: {
          amountMinor: list.reduce((a, r) => a + r.amountMinor, 0),
          paidMinor: list.reduce((a, r) => a + r.paidMinor, 0),
          remainingMinor: list.reduce((a, r) => a + r.remainingMinor, 0),
          lateFeeMinor: list.reduce((a, r) => a + r.lateFeeMinor, 0),
        },
        truncated: rows.length > LIMIT,
      };
    });
  }

  async accountCodes(): Promise<AccountCodesResponse> {
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, new Date());
      const groupOf = (code: string) => {
        const head = code[0];
        return head === "1" ? "assets" : head === "3" ? "liabilities" : head === "5" ? "equity" : head === "6" ? "income" : head === "7" ? "expense" : "other";
      };
      const accounts = [...journal.accounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "tr", { numeric: true }))
        .map(([code, name]) => ({ code, name, group: groupOf(parentOf(code) ?? code) }));
      const parties = (await tx.execute(sql`
        SELECT 'vendor' AS kind, name FROM vendors WHERE deleted_at IS NULL
        UNION ALL SELECT 'staff', full_name FROM staff WHERE deleted_at IS NULL
        ORDER BY 1, 2
      `)) as unknown as Row[];
      return {
        accounts,
        parties: parties.map((p) => ({
          kind: p.kind as "vendor" | "staff",
          code: p.kind === "vendor" ? "320" : "335",
          name: String(p.name),
        })),
      };
    });
  }

  async memberNotes(q: { q?: string; from?: string; to?: string }): Promise<MemberNotesResponse> {
    const like = q.q ? `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
    return this.db.tx(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT m.id, m.user_id, ${PERSON("us")} AS name, m.role::text AS role, m.notes, m.updated_at,
               (SELECT string_agg(DISTINCT ${UNIT_LABEL}, ', ') FROM unit_occupancies o JOIN units u ON u.id = o.unit_id
                  LEFT JOIN blocks b ON b.id = u.block_id
                 WHERE o.user_id = m.user_id AND (o.end_date IS NULL OR o.end_date > now())) AS units,
               (SELECT ${PERSON("au")} FROM audit_logs a JOIN users au ON au.id = a.user_id
                 WHERE a.resource = 'resident' AND a.resource_id::text = m.user_id::text AND a.diff::text LIKE '%"notes"%'
                 ORDER BY a.created_at DESC LIMIT 1) AS updated_by
        FROM memberships m JOIN users us ON us.id = m.user_id
        WHERE m.deleted_at IS NULL AND nullif(trim(m.notes), '') IS NOT NULL
          ${like ? sql`AND (${PERSON("us")} ILIKE ${like} OR m.notes ILIKE ${like})` : sql``}
          ${q.from ? sql`AND m.updated_at >= ${istanbulStart(q.from).toISOString()}::timestamptz` : sql``}
          ${q.to ? sql`AND m.updated_at <= ${istanbulEnd(q.to).toISOString()}::timestamptz` : sql``}
        ORDER BY m.updated_at DESC
        LIMIT 1000
      `)) as unknown as Row[];
      return {
        rows: rows.map((r) => ({
          membershipId: String(r.id),
          userId: String(r.user_id),
          name: s(r.name) ?? "—",
          role: String(r.role),
          units: s(r.units),
          note: String(r.notes),
          updatedAt: new Date(String(r.updated_at)),
          updatedBy: s(r.updated_by),
        })),
      };
    });
  }
}

@ApiTags("panel/reports")
@Controller("v1/panel/reports/extra")
export class ExtraReportsController {
  constructor(private readonly service: ExtraReportsService) {}

  @Get("collections")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Tahsilat raporu — üye ve harici tahsilatlar" })
  collections(@Query(new ZodQueryPipe(collectionReportQuery)) q: CollectionReportQuery) {
    return this.service.collections(q);
  }

  @Get("expenses")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Detaylı gider raporu + gider grubu özeti" })
  expenses(@Query(new ZodQueryPipe(expenseReportQuery)) q: ExpenseReportQuery) {
    return this.service.expenses(q);
  }

  @Get("cash-days")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Günlük / aylık özet bilanço — kasa devir, giren, çıkan, kalan" })
  cashDays(@Query(new ZodQueryPipe(cashDaysQuery)) q: { from: string; to: string; account?: string }) {
    return this.service.cashDays(q);
  }

  @Get("monthly")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Aylık bilanço — bağımsız bölüm başına tahakkuk, tahsilat, kalan" })
  monthly(@Query(new ZodQueryPipe(monthlyReportQuery)) q: { period: string }) {
    return this.service.monthly(q.period);
  }

  @Get("debt-runs")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Borçlandırma durum raporu" })
  debtRuns(@Query(new ZodQueryPipe(debtRunQuery)) q: DebtRunQuery) {
    return this.service.debtRuns(q);
  }

  @Get("debt-runs/detail")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Borçlandırma detay raporu" })
  debtRunDetail(@Query(new ZodQueryPipe(debtRunQuery)) q: DebtRunQuery) {
    return this.service.debtRunDetail(q);
  }

  @Get("account-codes")
  @RequirePermission("report:read")
  @ApiOperation({ summary: "Muhasebe kodları — hesap planı ve eşlemeler" })
  accountCodes() {
    return this.service.accountCodes();
  }

  @Get("member-notes")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "Üyelere kaydedilen notlar" })
  memberNotes(@Query(new ZodQueryPipe(memberNotesQuery)) q: { q?: string; from?: string; to?: string }) {
    return this.service.memberNotes(q);
  }
}
