import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { sql } from "drizzle-orm";

import {
  mergePeopleQuery,
  mergePeopleSave,
  type DataChecksResponse,
  type MergePeoplePreview,
  type MergePeopleSave,
} from "@yonetim/contracts";
import { maskPhone } from "@yonetim/core";

import { AuditService } from "../../governance/audit/audit.service";
import { RequirePermission } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";
import { ZodBodyPipe, ZodQueryPipe } from "../../infra/zod/zod-dto";
import type { Database } from "../unit/types";

type Row = Record<string, unknown>;
const SAMPLE = 20;
const UNIT_LABEL = sql`CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END`;
const NAME = (a: string) => sql.raw(`coalesce(nullif(trim(concat_ws(' ', ${a}.first_name, ${a}.last_name)), ''), '—')`);
const RESIDENT_ROLES = sql`('owner', 'tenant_resident')`;

/**
 * Kişiye bağlı, siteye ait kayıtlar — birleştirmede kaynak kişiden hedefe
 * taşınır. RLS işlem içinde açık: yalnız bu sitenin satırları değişir;
 * kaynak kişinin başka sitelerdeki kayıtlarına dokunulmaz.
 */
const MOVES: { table: string; column: string }[] = [
  { table: "debts", column: "debtor_user_id" },
  { table: "payments", column: "debtor_user_id" },
  { table: "payments", column: "payer_user_id" },
  { table: "legal_cases", column: "debtor_user_id" },
  { table: "unit_occupancies", column: "user_id" },
  { table: "units", column: "current_owner_id" },
  { table: "units", column: "current_tenant_id" },
  { table: "requests", column: "created_by_user_id" },
  { table: "request_comments", column: "user_id" },
  { table: "messages", column: "user_id" },
  { table: "notifications", column: "user_id" },
  { table: "reservations", column: "user_id" },
];

/**
 * Y9 — veri araçları. Tutarlılık kontrolleri salt okuma; birleştirme tek
 * işlemde, gerekçeli, denetim kaydına yazılır.
 */
@Injectable()
export class DataToolsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async checks(): Promise<DataChecksResponse> {
    return this.db.tx(async (tx) => {
      const run = async (
        key: DataChecksResponse["checks"][number]["key"],
        severity: "error" | "warning" | "info",
        query: ReturnType<typeof sql>,
        href: (r: Row) => string | null,
      ) => {
        const rows = (await tx.execute(sql`SELECT *, count(*) OVER () AS total FROM (${query}) q LIMIT ${SAMPLE}`)) as unknown as Row[];
        return {
          key,
          severity,
          count: Number(rows[0]?.total ?? 0),
          samples: rows.map((r) => ({ id: String(r.id), label: String(r.label), detail: r.detail === null || r.detail === undefined ? null : String(r.detail), href: href(r) })),
        };
      };
      const unitHref = (r: Row) => `/panel/birimler/${String(r.unit_id ?? r.id)}`;
      const personHref = (r: Row) => `/panel/sakinler/${String(r.id)}`;
      const checks = [
        await run("open_debt_no_debtor", "error", sql`
          SELECT d.id, d.unit_id, ${UNIT_LABEL} || ' · ' || d.description AS label, d.amount_kurus::text AS detail
          FROM debts d JOIN units u ON u.id = d.unit_id LEFT JOIN blocks b ON b.id = u.block_id
          WHERE d.deleted_at IS NULL AND d.debtor_user_id IS NULL AND d.status IN ('pending', 'partial', 'overdue')
          ORDER BY d.due_date`, unitHref),
        await run("overpaid_debt", "error", sql`
          SELECT d.id, d.unit_id, ${UNIT_LABEL} || ' · ' || d.description AS label, (d.paid_kurus - d.amount_kurus - d.late_fee_kurus)::text AS detail
          FROM debts d JOIN units u ON u.id = d.unit_id LEFT JOIN blocks b ON b.id = u.block_id
          WHERE d.deleted_at IS NULL AND d.paid_kurus > d.amount_kurus + d.late_fee_kurus
          ORDER BY d.due_date`, unitHref),
        await run("debt_status_mismatch", "warning", sql`
          SELECT d.id, d.unit_id, ${UNIT_LABEL} || ' · ' || d.description AS label, d.status::text AS detail
          FROM debts d JOIN units u ON u.id = d.unit_id LEFT JOIN blocks b ON b.id = u.block_id
          WHERE d.deleted_at IS NULL AND (
            (d.status = 'paid' AND d.paid_kurus < d.amount_kurus + d.late_fee_kurus)
            OR (d.status IN ('pending', 'overdue') AND d.paid_kurus > 0 AND d.paid_kurus < d.amount_kurus + d.late_fee_kurus)
            OR (d.status IN ('pending', 'partial', 'overdue') AND d.paid_kurus >= d.amount_kurus + d.late_fee_kurus AND d.amount_kurus > 0))
          ORDER BY d.due_date`, unitHref),
        await run("unit_no_owner", "warning", sql`
          SELECT u.id, ${UNIT_LABEL} AS label, NULL AS detail
          FROM units u LEFT JOIN blocks b ON b.id = u.block_id
          WHERE u.deleted_at IS NULL AND NOT EXISTS (
            SELECT 1 FROM unit_occupancies o WHERE o.unit_id = u.id AND o.relation = 'owner' AND (o.end_date IS NULL OR o.end_date > now()))
          ORDER BY b.name NULLS FIRST, u.number`, unitHref),
        await run("owner_share_not_100", "warning", sql`
          SELECT u.id, ${UNIT_LABEL} AS label, sum(o.ownership_pct)::text AS detail
          FROM units u LEFT JOIN blocks b ON b.id = u.block_id
          JOIN unit_occupancies o ON o.unit_id = u.id AND o.relation = 'owner' AND (o.end_date IS NULL OR o.end_date > now())
          WHERE u.deleted_at IS NULL
          GROUP BY u.id, b.name, u.number
          HAVING abs(sum(o.ownership_pct) - 100) > 0.01
          ORDER BY b.name NULLS FIRST, u.number`, unitHref),
        await run("member_no_unit", "info", sql`
          SELECT DISTINCT ON (us.id) us.id, ${NAME("us")} AS label, m.role::text AS detail
          FROM memberships m JOIN users us ON us.id = m.user_id
          WHERE m.deleted_at IS NULL AND m.role IN ${RESIDENT_ROLES} AND NOT EXISTS (
            SELECT 1 FROM unit_occupancies o WHERE o.user_id = m.user_id AND (o.end_date IS NULL OR o.end_date > now()))
          ORDER BY us.id`, personHref),
        await run("duplicate_people", "warning", sql`
          SELECT DISTINCT ON (us.id) us.id, ${NAME("us")} AS label,
                 CASE WHEN dup.by_phone THEN 'phone' ELSE 'name' END AS detail
          FROM memberships m JOIN users us ON us.id = m.user_id
          JOIN LATERAL (
            SELECT count(*) AS n, coalesce(bool_or(o.phone IS NOT NULL AND o.phone = us.phone), false) AS by_phone
            FROM memberships m2 JOIN users o ON o.id = m2.user_id
            WHERE m2.deleted_at IS NULL AND m2.user_id <> us.id AND m2.role IN ${RESIDENT_ROLES}
              AND ((o.phone IS NOT NULL AND o.phone = us.phone)
                OR (lower(trim(concat_ws(' ', o.first_name, o.last_name))) = lower(trim(concat_ws(' ', us.first_name, us.last_name)))
                    AND trim(concat_ws(' ', us.first_name, us.last_name)) <> ''))
          ) dup ON dup.n > 0
          WHERE m.deleted_at IS NULL AND m.role IN ${RESIDENT_ROLES}
          ORDER BY us.id`, personHref),
        await run("meter_no_unit", "info", sql`
          SELECT m.id, m.type::text || coalesce(' · ' || m.serial_no, '') AS label, NULL AS detail
          FROM meters m WHERE m.deleted_at IS NULL AND m.unit_id IS NULL AND NOT m.is_common`, (r) => `/panel/sayaclar/${String(r.id)}`),
        await run("unit_no_area", "info", sql`
          SELECT u.id, ${UNIT_LABEL} AS label, NULL AS detail
          FROM units u LEFT JOIN blocks b ON b.id = u.block_id
          WHERE u.deleted_at IS NULL AND coalesce(u.area_m2, 0) <= 0
          ORDER BY b.name NULLS FIRST, u.number`, unitHref),
      ];
      return { checks };
    });
  }

  private async person(tx: Database, id: string) {
    const [p] = (await tx.execute(sql`
      SELECT us.id, ${NAME("us")} AS name, us.phone, us.email,
             (SELECT array_agg(DISTINCT m.role::text) FROM memberships m WHERE m.user_id = us.id AND m.deleted_at IS NULL) AS roles,
             (SELECT array_agg(DISTINCT ${UNIT_LABEL}) FROM unit_occupancies o JOIN units u ON u.id = o.unit_id LEFT JOIN blocks b ON b.id = u.block_id
                WHERE o.user_id = us.id AND (o.end_date IS NULL OR o.end_date > now())) AS units
      FROM users us
      WHERE us.id = ${id} AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = us.id AND m.deleted_at IS NULL)
    `)) as unknown as Row[];
    if (!p || !p.roles) throw new NotFoundException("not_found");
    return {
      id: String(p.id),
      name: String(p.name),
      phone: p.phone ? maskPhone(String(p.phone)) : null,
      email: p.email ? String(p.email) : null,
      roles: (p.roles as string[]) ?? [],
      units: ((p.units as string[] | null) ?? []).filter(Boolean),
    };
  }

  async mergePreview(source: string, target: string): Promise<MergePeoplePreview> {
    if (source === target) throw new BadRequestException("validation_failed:same_person");
    return this.db.tx(async (tx) => {
      const [s, t] = [await this.person(tx, source), await this.person(tx, target)];
      const moves: Record<string, number> = {};
      for (const m of MOVES) {
        const [r] = (await tx.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(m.table)} WHERE ${sql.identifier(m.column)} = ${source}`)) as unknown as Row[];
        const n = Number(r?.n ?? 0);
        if (n > 0) moves[`${m.table}.${m.column}`] = n;
      }
      return { source: s, target: t, moves };
    });
  }

  async merge(dto: MergePeopleSave): Promise<{ moved: number }> {
    const preview = await this.mergePreview(dto.source, dto.target);
    const moved = await this.db.tx(async (tx) => {
      let total = 0;
      for (const m of MOVES) {
        const r = (await tx.execute(sql`
          UPDATE ${sql.identifier(m.table)} SET ${sql.identifier(m.column)} = ${dto.target}
          WHERE ${sql.identifier(m.column)} = ${dto.source}
          RETURNING 1
        `)) as unknown as Row[];
        total += r.length;
      }
      // Aynı dairede aynı ilişkide iki etkin kayıt olduysa: hisseler toplanır, fazlası kapanır.
      await tx.execute(sql`
        WITH dup AS (
          SELECT unit_id, relation, min(id::text)::uuid AS keep, sum(ownership_pct) AS pct, count(*) AS n
          FROM unit_occupancies
          WHERE user_id = ${dto.target} AND (end_date IS NULL OR end_date > now())
          GROUP BY unit_id, relation HAVING count(*) > 1
        ), upd AS (
          UPDATE unit_occupancies o SET ownership_pct = LEAST(dup.pct, 100), updated_at = now()
          FROM dup WHERE o.id = dup.keep RETURNING o.id
        )
        UPDATE unit_occupancies o SET end_date = now(), updated_at = now()
        FROM dup WHERE o.user_id = ${dto.target} AND o.unit_id = dup.unit_id AND o.relation = dup.relation
          AND o.id <> dup.keep AND (o.end_date IS NULL OR o.end_date > now())
      `);
      // Kaynak kişinin bu sitedeki notu hedefe eklenir; üyeliği kapanır.
      await tx.execute(sql`
        UPDATE memberships t SET notes = nullif(trim(concat_ws(E'\n', t.notes, s.notes)), ''), updated_at = now()
        FROM (SELECT string_agg(notes, E'\n') AS notes FROM memberships WHERE user_id = ${dto.source} AND deleted_at IS NULL AND nullif(trim(notes), '') IS NOT NULL) s
        WHERE t.user_id = ${dto.target} AND t.deleted_at IS NULL AND s.notes IS NOT NULL
          AND t.id = (SELECT id FROM memberships WHERE user_id = ${dto.target} AND deleted_at IS NULL ORDER BY created_at LIMIT 1)
      `);
      await tx.execute(sql`UPDATE memberships SET deleted_at = now(), updated_at = now() WHERE user_id = ${dto.source} AND deleted_at IS NULL`);
      return total;
    });
    await this.audit.record({
      action: "people_merged",
      resource: "resident",
      resourceId: dto.target,
      reason: dto.reason,
      diff: { source: { from: dto.source, to: null }, target: { from: null, to: dto.target }, moves: { from: null, to: preview.moves } },
    });
    return { moved };
  }
}

@ApiTags("panel/data-tools")
@Controller("v1/panel/data-tools")
export class DataToolsController {
  constructor(private readonly service: DataToolsService) {}

  @Get("checks")
  @RequirePermission("resident:read")
  @ApiOperation({ summary: "Veri tutarlılık kontrolü" })
  checks() {
    return this.service.checks();
  }

  @Get("merge/preview")
  @RequirePermission("resident:write")
  @ApiOperation({ summary: "Cari birleştirme önizlemesi — taşınacak kayıtlar" })
  mergePreview(@Query(new ZodQueryPipe(mergePeopleQuery)) q: { source: string; target: string }) {
    return this.service.mergePreview(q.source, q.target);
  }

  @Post("merge")
  @RequirePermission("resident:write", "settings:write")
  @ApiOperation({ summary: "Cari birleştir — kaynak kişinin bu sitedeki kayıtları hedefe taşınır" })
  merge(@Body(new ZodBodyPipe(mergePeopleSave)) dto: MergePeopleSave) {
    return this.service.merge(dto);
  }
}
