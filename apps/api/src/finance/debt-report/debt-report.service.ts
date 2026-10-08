import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import type {
  DebtMatrixQuery,
  DebtMatrixResponse,
  MemberScope,
  OpenItemsResponse,
  ReceiptListResponse,
} from "@yonetim/contracts";

import { DbService } from "../../infra/db/db.service";
import { istanbulEnd, istanbulStart } from "../accounting/accounting.service";
import { memberScopeSql } from "../member-scope";
import { buildDebtMatrix } from "./matrix";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Bölümün kısa adı ve bugünkü oturanı (malik önce) — rapor satırları için. */
const UNIT_LABEL = sql`CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END`;
const UNIT_HOLDER = sql`(SELECT nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '')
  FROM unit_occupancies o JOIN users us ON us.id = o.user_id
  WHERE o.unit_id = u.id AND o.end_date IS NULL
  ORDER BY (o.relation = 'owner') DESC, o.start_date LIMIT 1)`;
const PERSON = (alias: string) =>
  sql.raw(`nullif(trim(concat_ws(' ', ${alias}.first_name, ${alias}.last_name)), '')`);

/**
 * Borç raporları — dönem matrisi, açık kalem dökümü, makbuz dökümü.
 * Hepsi üye kapsamını (`member`) aynı SQL tanımıyla uygular.
 */
@Injectable()
export class DebtReportService {
  constructor(private readonly db: DbService) {}

  async matrix(q: DebtMatrixQuery): Promise<DebtMatrixResponse> {
    const bucket =
      q.basis === "period"
        ? sql`COALESCE(d.period, to_char(d.due_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM'))`
        : sql`to_char(d.due_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM')`;
    const typeFilter = q.debtTypeId ? sql`AND d.debt_type_id = ${q.debtTypeId}` : sql``;
    const byMember = q.rows === "member";

    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT
          ${byMember ? sql`COALESCE(d.debtor_user_id::text, 'unit:' || u.id::text)` : sql`u.id::text`} AS key,
          ${byMember ? sql`COALESCE(${PERSON("du")}, ${UNIT_LABEL})` : UNIT_LABEL} AS label,
          ${
            byMember
              ? sql`string_agg(DISTINCT ${UNIT_LABEL} || COALESCE(' · ' || (
                  SELECT CASE WHEN o.end_date IS NULL THEN '' ELSE '(E) ' END ||
                         CASE o.relation WHEN 'owner' THEN 'Malik' ELSE 'Kiracı' END
                  FROM unit_occupancies o WHERE o.unit_id = d.unit_id AND o.user_id = d.debtor_user_id
                  ORDER BY (o.end_date IS NULL) DESC, o.end_date DESC NULLS LAST LIMIT 1), ''), ', ')`
              : sql`MAX(${UNIT_HOLDER})`
          } AS sub,
          ${bucket} AS bucket,
          SUM(d.amount_kurus) AS amount, SUM(d.late_fee_kurus) AS late_fee, SUM(d.paid_kurus) AS paid,
          (d.status = 'written_off') AS closed
        FROM debts d
        JOIN units u ON u.id = d.unit_id
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN users du ON du.id = d.debtor_user_id
        WHERE d.deleted_at IS NULL AND d.status <> 'cancelled' ${typeFilter}
          AND ${memberScopeSql(q.member, sql`d.debtor_user_id`, sql`d.unit_id`)}
        GROUP BY 1, 2, ${bucket}, (d.status = 'written_off')
      `)) as unknown as Row[],
    );

    // Kişi satırında `sub` gruplar arasında farklı gelebilir (iki dönemde iki
    // daire); ilk görüleni değil birleşimini göster.
    const subs = new Map<string, Set<string>>();
    for (const r of rows) {
      const k = String(r.key);
      for (const part of String(r.sub ?? "").split(", ").filter(Boolean)) {
        let set = subs.get(k);
        if (!set) subs.set(k, (set = new Set()));
        set.add(part);
      }
    }

    const result = buildDebtMatrix(
      rows.map((r) => ({
        key: String(r.key),
        label: String(r.label),
        sub: [...(subs.get(String(r.key)) ?? [])].join(", ") || null,
        bucket: String(r.bucket),
        amount: n(r.amount),
        lateFee: n(r.late_fee),
        paid: n(r.paid),
        closed: r.closed === true,
      })),
      { year: q.year, value: q.value, lateFee: q.lateFee === "1" },
    );
    return { year: q.year, ...result };
  }

  async openItems(q: {
    member?: MemberScope;
    unitId?: string;
    blockId?: string;
    debtTypeId?: string;
    periodUntil?: string;
    minTotal?: number;
    overdueOnly: boolean;
  }): Promise<OpenItemsResponse> {
    const now = new Date();
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT d.id, d.unit_id, ${UNIT_LABEL} AS label, ${UNIT_HOLDER} AS holder,
               d.description, d.period, d.due_date, ${PERSON("du")} AS debtor_name,
               d.amount_kurus, d.late_fee_kurus, d.paid_kurus
        FROM debts d
        JOIN units u ON u.id = d.unit_id
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN users du ON du.id = d.debtor_user_id
        WHERE d.deleted_at IS NULL AND d.status NOT IN ('paid', 'written_off', 'cancelled')
          AND d.amount_kurus + d.late_fee_kurus - d.paid_kurus > 0
          ${q.unitId ? sql`AND d.unit_id = ${q.unitId}` : sql``}
          ${q.blockId ? sql`AND u.block_id = ${q.blockId}` : sql``}
          ${q.debtTypeId ? sql`AND d.debt_type_id = ${q.debtTypeId}` : sql``}
          ${
            q.periodUntil
              ? sql`AND COALESCE(d.period, to_char(d.due_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM')) <= ${q.periodUntil}`
              : sql``
          }
          ${q.overdueOnly ? sql`AND d.due_date < ${now.toISOString()}::timestamptz` : sql``}
          AND ${memberScopeSql(q.member, sql`d.debtor_user_id`, sql`d.unit_id`)}
        ORDER BY b.name NULLS FIRST, NULLIF(substring(u.number from '[0-9]+'), '')::numeric NULLS LAST, u.number, d.due_date
      `)) as unknown as Row[],
    );

    const units = new Map<string, OpenItemsResponse["units"][number]>();
    for (const r of rows) {
      const unitId = String(r.unit_id);
      let unit = units.get(unitId);
      if (!unit) {
        unit = { unitId, label: String(r.label), holder: s(r.holder), debtors: [], items: [], totalMinor: 0, overdueMinor: 0 };
        units.set(unitId, unit);
      }
      const dueDate = new Date(String(r.due_date));
      const remaining = n(r.amount_kurus) + n(r.late_fee_kurus) - n(r.paid_kurus);
      const overdue = dueDate.getTime() < now.getTime();
      unit.items.push({
        debtId: String(r.id),
        description: String(r.description),
        period: s(r.period),
        dueDate,
        debtorName: s(r.debtor_name),
        amountMinor: n(r.amount_kurus),
        lateFeeMinor: n(r.late_fee_kurus),
        paidMinor: n(r.paid_kurus),
        remainingMinor: remaining,
        overdue,
      });
      unit.totalMinor += remaining;
      if (overdue) unit.overdueMinor += remaining;
      const debtor = s(r.debtor_name);
      if (debtor && !unit.debtors.includes(debtor)) unit.debtors.push(debtor);
    }
    const list = [...units.values()].filter(
      (u) => q.minTotal === undefined || u.totalMinor >= q.minTotal,
    );
    return {
      units: list,
      totalMinor: list.reduce((a, u) => a + u.totalMinor, 0),
      overdueMinor: list.reduce((a, u) => a + u.overdueMinor, 0),
    };
  }

  async receipts(q: { from: string; to: string; member?: MemberScope }): Promise<ReceiptListResponse> {
    if (q.from > q.to) throw new BadRequestException("validation_failed:range_order");
    const days = (istanbulStart(q.to).getTime() - istanbulStart(q.from).getTime()) / 86_400_000;
    if (days > 366) throw new BadRequestException("validation_failed:range_too_long");

    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT p.id, p.receipt_no, coalesce(p.paid_at, p.created_at) AS paid_at, p.method::text AS method,
               p.amount_kurus - p.refunded_kurus AS amount,
               CASE WHEN u.id IS NULL THEN NULL ELSE ${UNIT_LABEL} END AS unit_label,
               ${PERSON("pu")} AS payer_name, ${PERSON("du")} AS debtor_name,
               COALESCE((
                 SELECT json_agg(json_build_object('description', d.description, 'amount', a.amount_kurus) ORDER BY d.due_date)
                 FROM payment_allocations a JOIN debts d ON d.id = a.debt_id
                 WHERE a.payment_id = p.id
               ), '[]'::json) AS allocations
        FROM payments p
        LEFT JOIN units u ON u.id = p.unit_id
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN users pu ON pu.id = p.payer_user_id
        LEFT JOIN users du ON du.id = COALESCE(p.debtor_user_id, p.payer_user_id)
        WHERE p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance')
          AND coalesce(p.paid_at, p.created_at) BETWEEN ${istanbulStart(q.from).toISOString()}::timestamptz
                                                    AND ${istanbulEnd(q.to).toISOString()}::timestamptz
          AND ${memberScopeSql(q.member, sql`COALESCE(p.debtor_user_id, p.payer_user_id)`, sql`p.unit_id`)}
        ORDER BY coalesce(p.paid_at, p.created_at), p.receipt_no NULLS LAST
      `)) as unknown as Row[],
    );

    const list = rows.map((r) => ({
      paymentId: String(r.id),
      receiptNo: s(r.receipt_no),
      paidAt: new Date(String(r.paid_at)),
      unitLabel: s(r.unit_label),
      payerName: s(r.payer_name),
      debtorName: s(r.debtor_name),
      method: String(r.method),
      amountMinor: n(r.amount),
      allocations: ((r.allocations ?? []) as { description: string; amount: number }[]).map((a) => ({
        description: a.description,
        amountMinor: Number(a.amount),
      })),
    }));
    return { rows: list, totalMinor: list.reduce((a, r) => a + r.amountMinor, 0) };
  }
}
