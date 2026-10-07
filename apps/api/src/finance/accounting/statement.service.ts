import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type {
  ActivitySummaryResponse,
  BalanceSheetResponse,
  IncomeStatementResponse,
  LedgerResponse,
  OperatingBookResponse,
  UnitStatementResponse,
} from "@yonetim/contracts";

import { DbService } from "../../infra/db/db.service";
import { istanbulDate, istanbulEnd, istanbulStart } from "./accounting.service";
import { loadJournal } from "./journal";
import {
  balanceSheet,
  incomeStatement,
  ledger,
  monthsInRange,
  operatingBook,
} from "./statements";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

/**
 * Mali tablolar ve dönem raporları.
 *
 * Gelir-gider, bilanço, kebir ve işletme defteri **fiş listesinden**
 * (`journal.ts`) — mizanla aynı kaynak. Toplu hesap özeti borç/tahsilat
 * tablolarından ama aynı kurallarla (iptal borç yok, mahsup tahsilat değil,
 * silinen alacak alacak azaltır); toplamı 120'nin bakiyesine eşit.
 */
@Injectable()
export class StatementService {
  constructor(private readonly db: DbService) {}

  async incomeStatement(
    from: string,
    to: string,
  ): Promise<IncomeStatementResponse> {
    assertRange(from, to);
    const start = istanbulStart(from);
    const end = istanbulEnd(to);
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, end);
      return {
        from,
        to,
        ...incomeStatement(journal, start, end, monthsInRange(from, to)),
      };
    });
  }

  async balanceSheet(at: string): Promise<BalanceSheetResponse> {
    const end = istanbulEnd(at);
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, end);
      return {
        at,
        ...balanceSheet(journal, end, istanbulStart(`${at.slice(0, 4)}-01-01`)),
      };
    });
  }

  async ledger(
    code: string,
    from: string,
    to: string,
  ): Promise<LedgerResponse> {
    assertRange(from, to);
    const end = istanbulEnd(to);
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, end);
      return { from, to, ...ledger(journal, code, istanbulStart(from), end) };
    });
  }

  async operatingBook(
    from: string,
    to: string,
  ): Promise<OperatingBookResponse> {
    assertRange(from, to);
    const end = istanbulEnd(to);
    return this.db.tx(async (tx) => {
      const journal = await loadJournal(tx, end);
      return { from, to, ...operatingBook(journal, istanbulStart(from), end) };
    });
  }

  /**
   * Toplu hesap özeti — her bağımsız bölüm için devir, borçlandırma,
   * tahsilat ve bakiye. Silinen alacak borçlandırmayı azaltan (alacak)
   * satır olarak yazılır, böylece kapanış = sakinin gerçekte ödeyeceği.
   */
  async unitStatements(params: {
    from: string;
    to: string;
    unitId?: string;
    detail?: boolean;
    onlyOpen?: boolean;
  }): Promise<UnitStatementResponse> {
    assertRange(params.from, params.to);
    const start = istanbulStart(params.from).getTime();
    const end = istanbulEnd(params.to);
    const endIso = end.toISOString();
    const unitFilter = params.unitId ? sql`AND u.id = ${params.unitId}` : sql``;
    const debtUnitFilter = params.unitId
      ? sql`AND d.unit_id = ${params.unitId}`
      : sql``;
    const payUnitFilter = params.unitId
      ? sql`AND p.unit_id = ${params.unitId}`
      : sql``;

    return this.db.tx(async (tx) => {
      const q = async (query: ReturnType<typeof sql>) =>
        (await tx.execute(query)) as unknown as Row[];
      const [unitRows, debtRows, payRows] = await Promise.all([
        q(sql`
          SELECT u.id, u.number, b.name AS block_name,
                 (SELECT nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '')
                  FROM unit_occupancies o JOIN users us ON us.id = o.user_id
                  WHERE o.unit_id = u.id AND o.end_date IS NULL
                  ORDER BY (o.relation = 'owner') DESC, o.start_date LIMIT 1) AS holder
          FROM units u LEFT JOIN blocks b ON b.id = u.block_id
          WHERE u.deleted_at IS NULL ${unitFilter}
          ORDER BY b.name NULLS FIRST, u.number
        `),
        q(sql`
          SELECT d.unit_id, d.description, d.amount_kurus, d.paid_kurus, d.status::text AS status, d.updated_at,
                 CASE WHEN (d.metadata ? 'opening' OR d.metadata ? 'migrated') THEN d.due_date ELSE d.created_at END AS at
          FROM debts d
          WHERE d.deleted_at IS NULL AND d.status <> 'cancelled' AND d.unit_id IS NOT NULL ${debtUnitFilter}
            AND CASE WHEN (d.metadata ? 'opening' OR d.metadata ? 'migrated') THEN d.due_date ELSE d.created_at END <= ${endIso}::timestamptz
        `),
        q(sql`
          SELECT p.unit_id, p.amount_kurus - p.refunded_kurus AS amount, coalesce(p.paid_at, p.created_at) AS at,
                 p.method::text AS method, p.receipt_no
          FROM payments p
          WHERE p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance') AND p.unit_id IS NOT NULL ${payUnitFilter}
            AND coalesce(p.paid_at, p.created_at) <= ${endIso}::timestamptz
        `),
      ]);

      type Move = {
        at: Date;
        description: string;
        debit: number;
        credit: number;
      };
      const moves = new Map<string, Move[]>();
      const push = (unitId: string, m: Move) => {
        let list = moves.get(unitId);
        if (!list) moves.set(unitId, (list = []));
        list.push(m);
      };
      for (const r of debtRows) {
        const unitId = String(r.unit_id);
        push(unitId, {
          at: new Date(String(r.at)),
          description: String(r.description),
          debit: n(r.amount_kurus),
          credit: 0,
        });
        if (r.status === "written_off") {
          const open = n(r.amount_kurus) - n(r.paid_kurus);
          const at = new Date(String(r.updated_at));
          if (open > 0 && at.getTime() <= end.getTime())
            push(unitId, {
              at,
              description: `Silinen alacak — ${r.description}`,
              debit: 0,
              credit: open,
            });
        }
      }
      for (const r of payRows) {
        const amount = n(r.amount);
        if (amount <= 0) continue;
        const no = r.receipt_no ? ` (makbuz ${r.receipt_no})` : "";
        push(String(r.unit_id), {
          at: new Date(String(r.at)),
          description: `Tahsilat${no}`,
          debit: 0,
          credit: amount,
        });
      }

      unitRows.sort(
        (a, b) =>
          String(a.block_name ?? "").localeCompare(
            String(b.block_name ?? ""),
            "tr",
            { numeric: true },
          ) ||
          String(a.number).localeCompare(String(b.number), "tr", {
            numeric: true,
          }),
      );
      const rows = unitRows.map((u) => {
        const list = (moves.get(String(u.id)) ?? []).sort(
          (a, b) => a.at.getTime() - b.at.getTime(),
        );
        let opening = 0;
        let charged = 0;
        let paid = 0;
        const lines: UnitStatementResponse["rows"][number]["lines"] =
          params.detail ? [] : null;
        for (const m of list) {
          if (m.at.getTime() < start) {
            opening += m.debit - m.credit;
            continue;
          }
          // Silinen alacak tahsilat değil: borçlandırmayı azaltır.
          if (m.description.startsWith("Silinen alacak")) charged -= m.credit;
          else {
            charged += m.debit;
            paid += m.credit;
          }
          if (lines)
            lines.push({
              date: m.at,
              description: m.description,
              debitMinor: m.debit,
              creditMinor: m.credit,
              balanceMinor: opening + charged - paid,
            });
        }
        return {
          unitId: String(u.id),
          label: u.block_name
            ? `${u.block_name} / ${u.number}`
            : String(u.number),
          holder: (u.holder as string | null) ?? null,
          openingMinor: opening,
          chargedMinor: charged,
          paidMinor: paid,
          closingMinor: opening + charged - paid,
          lines,
        };
      });
      const visible = params.onlyOpen
        ? rows.filter((r) => r.closingMinor !== 0)
        : rows;
      const sum = (
        k: "openingMinor" | "chargedMinor" | "paidMinor" | "closingMinor",
      ) => visible.reduce((s, r) => s + r[k], 0);
      return {
        from: params.from,
        to: params.to,
        rows: visible,
        totals: {
          openingMinor: sum("openingMinor"),
          chargedMinor: sum("chargedMinor"),
          paidMinor: sum("paidMinor"),
          closingMinor: sum("closingMinor"),
        },
      };
    });
  }

  /**
   * Yönetim faaliyet raporu ve denetim raporunun sayısal gövdesi: dönemde
   * yapılan işlerin özeti. Mali rakamlar fiş listesinden; operasyon
   * sayıları kendi tablolarından.
   */
  async activitySummary(
    from: string,
    to: string,
  ): Promise<ActivitySummaryResponse> {
    assertRange(from, to);
    const start = istanbulStart(from);
    const end = istanbulEnd(to);
    const s = start.toISOString();
    const e = end.toISOString();
    return this.db.tx(async (tx) => {
      const q = async (query: ReturnType<typeof sql>) =>
        (await tx.execute(query)) as unknown as Row[];
      const journal = await loadJournal(tx, end);

      let charged = 0;
      let collected = 0;
      let otherIncome = 0;
      let expense = 0;
      const byExpense = new Map<string, number>();
      let receivables = 0;
      for (const entry of journal.entries) {
        for (const l of entry.lines)
          if (l.code === "120") receivables += l.debit - l.credit;
        if (entry.date.getTime() < start.getTime()) continue;
        for (const l of entry.lines) {
          if (entry.source === "debt" && l.code === "120") charged += l.debit;
          if (entry.source === "payment" && l.code === "120")
            collected += l.credit;
          if (entry.source === "income" && l.credit > 0)
            otherIncome += l.credit;
          if (l.code.startsWith("7")) {
            expense += l.debit - l.credit;
            byExpense.set(
              l.code,
              (byExpense.get(l.code) ?? 0) + l.debit - l.credit,
            );
          }
        }
      }

      const [
        [req],
        [mnt],
        meetings,
        [ann],
        [res],
        [legal],
        [staffCount],
        [units],
        budgetRows,
      ] = await Promise.all([
        q(sql`
          SELECT count(*) FILTER (WHERE created_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz)::int AS opened,
                 count(*) FILTER (WHERE resolved_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz)::int AS resolved,
                 count(*) FILTER (WHERE status::text NOT IN ('resolved', 'closed', 'rejected'))::int AS open
          FROM requests WHERE deleted_at IS NULL
        `),
        q(sql`
          SELECT (SELECT count(*)::int FROM maintenance_logs WHERE done_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz) AS done,
                 (SELECT coalesce(sum(cost_kurus), 0)::bigint FROM maintenance_logs WHERE done_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz) AS cost,
                 (SELECT count(*)::int FROM maintenance_records WHERE deleted_at IS NULL AND is_active AND next_due_at < now()) AS overdue
        `),
        q(sql`
          SELECT m.scheduled_at, m.title, m.kind, m.status,
                 (SELECT count(*)::int FROM meeting_decisions d WHERE d.meeting_id = m.id) AS decisions
          FROM meetings m
          WHERE m.scheduled_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz
          ORDER BY m.scheduled_at
        `),
        q(
          sql`SELECT count(*)::int AS c FROM announcements WHERE coalesce(published_at, created_at) BETWEEN ${s}::timestamptz AND ${e}::timestamptz`,
        ),
        q(
          sql`SELECT count(*)::int AS c FROM reservations WHERE start_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz AND status::text IN ('approved', 'completed')`,
        ),
        q(sql`
          SELECT count(*) FILTER (WHERE opened_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz)::int AS opened,
                 count(*) FILTER (WHERE closed_at BETWEEN ${s}::timestamptz AND ${e}::timestamptz)::int AS closed,
                 count(*) FILTER (WHERE closed_at IS NULL)::int AS open
          FROM legal_cases
        `),
        q(
          sql`SELECT count(*)::int AS c FROM staff WHERE deleted_at IS NULL AND is_active`,
        ),
        q(sql`
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE EXISTS (
                   SELECT 1 FROM debts d WHERE d.unit_id = u.id AND d.deleted_at IS NULL
                     AND d.status IN ('pending', 'partial', 'overdue', 'in_legal') AND d.due_date < now()))::int AS overdue
          FROM units u WHERE u.deleted_at IS NULL
        `),
        q(sql`
          SELECT b.id, b.name, b.start_period, b.end_period, b.reserve_pct,
                 (SELECT coalesce(sum(planned_kurus), 0)::bigint FROM operating_budget_lines l WHERE l.budget_id = b.id) AS planned
          FROM operating_budgets b
          WHERE b.deleted_at IS NULL AND b.start_period <= ${to.slice(0, 7)} AND b.end_period >= ${from.slice(0, 7)}
          ORDER BY (b.status = 'approved') DESC, b.start_period DESC LIMIT 1
        `),
      ]);

      let budget: ActivitySummaryResponse["budget"] = null;
      const b = budgetRows[0];
      if (b) {
        const months = monthsInRange(
          `${b.start_period}-01`,
          `${b.end_period}-01`,
          999,
        ).length;
        const elapsed = monthsInRange(
          `${b.start_period}-01`,
          istanbulDate(end),
          999,
        ).filter((m) => m <= String(b.end_period)).length;
        const totalPlanned = Math.round(
          n(b.planned) * (1 + n(b.reserve_pct) / 100),
        );
        const budgetStart = istanbulStart(`${b.start_period}-01`).getTime();
        let actual = 0;
        for (const entry of journal.entries)
          if (entry.date.getTime() >= budgetStart)
            for (const l of entry.lines)
              if (l.code.startsWith("7")) actual += l.debit - l.credit;
        budget = {
          id: String(b.id),
          name: String(b.name),
          plannedToDateMinor:
            months > 0
              ? Math.round((totalPlanned * Math.min(elapsed, months)) / months)
              : 0,
          actualToDateMinor: actual,
        };
      }

      return {
        from,
        to,
        finance: {
          chargedMinor: charged,
          collectedMinor: collected,
          otherIncomeMinor: otherIncome,
          expenseMinor: expense,
          receivablesMinor: receivables,
          overdueUnits: n(units?.overdue),
          unitCount: n(units?.total),
        },
        topExpenses: [...byExpense.entries()]
          .filter(([, v]) => v > 0)
          .sort((a, b2) => b2[1] - a[1])
          .slice(0, 8)
          .map(([code, amount]) => ({
            name: journal.accounts.get(code) ?? code,
            amountMinor: amount,
          })),
        requests: {
          opened: n(req?.opened),
          resolved: n(req?.resolved),
          open: n(req?.open),
        },
        maintenance: {
          done: n(mnt?.done),
          costMinor: n(mnt?.cost),
          overdue: n(mnt?.overdue),
        },
        meetings: meetings.map((m) => ({
          date: new Date(String(m.scheduled_at)),
          title: String(m.title),
          kind: String(m.kind),
          status: String(m.status),
          decisions: n(m.decisions),
        })),
        announcements: n(ann?.c),
        reservations: n(res?.c),
        legal: {
          opened: n(legal?.opened),
          closed: n(legal?.closed),
          open: n(legal?.open),
        },
        staffCount: n(staffCount?.c),
        budget,
      };
    });
  }
}

function assertRange(from: string, to: string) {
  if (from > to) throw new BadRequestException("validation_failed:range_order");
  // Fiş listesi baştan yükleniyor; aralık sınırı yanıt boyutu için.
  const days =
    (istanbulStart(to).getTime() - istanbulStart(from).getTime()) / 86_400_000;
  if (days > 366 * 3)
    throw new BadRequestException("validation_failed:range_too_long");
}
