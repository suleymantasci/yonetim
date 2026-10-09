import { ForbiddenException, Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";

import { maskPhone } from "@yonetim/core";
import { relationMatchesScope, type MemberRelation, type MemberScope } from "@yonetim/contracts";

import { AuditService } from "../../governance/audit/audit.service";
import { grants } from "../../identity/permission";
import { DbService } from "../../infra/db/db.service";
import { PiiService } from "../resident/pii.service";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const UNIT_LABEL = sql`CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END`;
const ORDER = sql`b.sort_order NULLS LAST, b.name NULLS FIRST, NULLIF(substring(u.number from '[0-9]+'), '')::numeric NULLS LAST, u.number`;

/** Kişi × daire ilişkileri — kapsam süzgeci ve "(E)" durumu için. */
interface PersonRow {
  unitId: string;
  unitLabel: string;
  userId: string;
  name: string;
  relation: string;
  former: boolean;
  phone: string | null;
  email: string | null;
  tckn: string | null;
  share: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Üye listeleri. Açık TC ve açık telefon yalnız `resident:write` (yönetici)
 * ile ve denetim kaydına yazılarak; varsayılan maskeli.
 */
@Injectable()
export class ListsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly pii: PiiService,
  ) {}

  private blockSql(blockId?: string): SQL {
    return blockId ? sql`AND u.block_id = ${blockId}` : sql``;
  }

  /** Bölümlerdeki kişiler (aktif + eski), kapsamla süzülmüş. */
  private async people(q: { blockId?: string; member?: MemberScope; search?: string }): Promise<PersonRow[]> {
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id AS unit_id, ${UNIT_LABEL} AS unit_label, o.user_id, o.relation::text AS relation,
               o.end_date IS NOT NULL AS ended, o.ownership_pct, o.start_date, o.end_date,
               nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '') AS name,
               us.phone, us.email, us.tckn_encrypted,
               EXISTS (SELECT 1 FROM unit_occupancies t WHERE t.unit_id = u.id AND t.relation = 'tenant' AND t.end_date IS NULL) AS has_tenant
        FROM units u
        LEFT JOIN blocks b ON b.id = u.block_id
        JOIN unit_occupancies o ON o.unit_id = u.id
        JOIN users us ON us.id = o.user_id
        WHERE u.deleted_at IS NULL ${this.blockSql(q.blockId)}
        ORDER BY ${ORDER}, (o.relation = 'owner') DESC, o.start_date
      `)) as unknown as Row[],
    );
    const rels = new Map<string, MemberRelation[]>();
    for (const r of rows) {
      const k = `${String(r.unit_id)}:${String(r.user_id)}`;
      const list = rels.get(k) ?? [];
      list.push({ relation: String(r.relation), ended: r.ended === true, unitHasActiveTenant: r.has_tenant === true });
      rels.set(k, list);
    }
    const needle = q.search?.toLocaleLowerCase("tr");
    const seen = new Set<string>();
    const out: PersonRow[] = [];
    for (const r of rows) {
      const k = `${String(r.unit_id)}:${String(r.user_id)}`;
      if (seen.has(k)) continue;
      const list = rels.get(k)!;
      if (!relationMatchesScope(list, q.member ?? "all")) continue;
      const name = s(r.name) ?? "—";
      if (needle && !name.toLocaleLowerCase("tr").includes(needle)) continue;
      seen.add(k);
      const active = list.find((x) => !x.ended);
      out.push({
        unitId: String(r.unit_id),
        unitLabel: String(r.unit_label),
        userId: String(r.user_id),
        name,
        relation: (active ?? list[0]!).relation,
        former: !active,
        phone: s(r.phone),
        email: s(r.email),
        tckn: s(r.tckn_encrypted),
        share: r.ownership_pct === null ? null : String(r.ownership_pct),
        startDate: r.start_date ? new Date(String(r.start_date)).toISOString().slice(0, 10) : null,
        endDate: r.end_date ? new Date(String(r.end_date)).toISOString().slice(0, 10) : null,
      });
    }
    return out;
  }

  private assertReveal(what: string) {
    if (!grants(this.db.ctx(), "resident:write")) throw new ForbiddenException(`forbidden:reveal_${what}`);
  }

  async household(q: { blockId?: string; member?: MemberScope; search?: string; relation?: string; self: boolean }) {
    const people = q.self && !q.relation ? await this.people(q) : [];
    const unitFilter = q.member && q.member !== "all" ? new Set((await this.people({ ...q, search: undefined })).map((p) => p.unitId)) : null;
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id AS unit_id, ${UNIT_LABEL} AS unit_label, h.full_name, h.relation, h.phone
        FROM household_members h JOIN units u ON u.id = h.unit_id LEFT JOIN blocks b ON b.id = u.block_id
        WHERE u.deleted_at IS NULL ${this.blockSql(q.blockId)}
          ${q.relation ? sql`AND h.relation = ${q.relation}` : sql``}
          ${q.search ? sql`AND h.full_name ILIKE ${`%${q.search}%`}` : sql``}
        ORDER BY ${ORDER}, h.created_at
      `)) as unknown as Row[],
    );
    const list = [
      ...people.map((p) => ({
        unitId: p.unitId,
        unitLabel: p.unitLabel,
        status: p.former ? `former_${p.relation}` : p.relation,
        relation: "self",
        fullName: p.name,
        phoneMasked: p.phone ? maskPhone(p.phone) : null,
      })),
      ...rows
        .filter((r) => !unitFilter || unitFilter.has(String(r.unit_id)))
        .map((r) => ({
          unitId: String(r.unit_id),
          unitLabel: String(r.unit_label),
          status: "household",
          relation: String(r.relation),
          fullName: String(r.full_name),
          phoneMasked: r.phone ? maskPhone(String(r.phone)) : null,
        })),
    ];
    const order = new Map(list.map((r, i) => [r, i]));
    return {
      rows: list.sort((a, b) => a.unitLabel.localeCompare(b.unitLabel, "tr", { numeric: true }) || order.get(a)! - order.get(b)!),
    };
  }

  async vehicles(q: { blockId?: string; member?: MemberScope; search?: string; has: "yes" | "no" | "all" }) {
    const scoped = q.member && q.member !== "all" ? await this.people({ blockId: q.blockId, member: q.member }) : null;
    const allowed = scoped ? new Set(scoped.map((p) => p.unitId)) : null;
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id AS unit_id, ${UNIT_LABEL} AS unit_label, v.plate, v.description, v.owner_name,
               (SELECT string_agg(nullif(trim(concat_ws(' ', us.first_name, us.last_name)), ''), ', ')
                FROM unit_occupancies o JOIN users us ON us.id = o.user_id
                WHERE o.unit_id = u.id AND o.end_date IS NULL) AS people
        FROM units u LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN unit_vehicles v ON v.unit_id = u.id
        WHERE u.deleted_at IS NULL ${this.blockSql(q.blockId)}
          ${q.has === "yes" ? sql`AND v.id IS NOT NULL` : q.has === "no" ? sql`AND NOT EXISTS (SELECT 1 FROM unit_vehicles x WHERE x.unit_id = u.id)` : sql``}
          ${q.search ? sql`AND (v.plate ILIKE ${`%${q.search.replace(/\s/g, "").toLocaleUpperCase("tr")}%`} OR v.owner_name ILIKE ${`%${q.search}%`})` : sql``}
        ORDER BY ${ORDER}, v.plate
      `)) as unknown as Row[],
    );
    return {
      rows: rows
        .filter((r) => !allowed || allowed.has(String(r.unit_id)))
        .map((r) => ({
          unitId: String(r.unit_id),
          unitLabel: String(r.unit_label),
          people: s(r.people),
          plate: s(r.plate),
          description: s(r.description),
          ownerName: s(r.owner_name),
        })),
    };
  }

  async tckn(q: { blockId?: string; member?: MemberScope; search?: string; reveal: boolean }) {
    if (q.reveal) this.assertReveal("tckn");
    const tenantId = this.db.ctx().tenantId;
    const people = await this.people(q);
    const rows = people.map((p) => ({
      unitId: p.unitId,
      unitLabel: p.unitLabel,
      relation: p.relation,
      former: p.former,
      fullName: p.name,
      tckn: q.reveal ? this.pii.open(p.tckn, tenantId, "tckn") : this.pii.revealTcknMasked(p.tckn, tenantId),
    }));
    if (q.reveal) {
      await this.audit.record({
        action: "tckn_list_revealed",
        resource: "resident",
        diff: { count: { from: null, to: rows.filter((r) => r.tckn).length } },
      });
    }
    return { rows };
  }

  async occupancy(q: { blockId?: string; state: "all" | "empty" | "occupied" }) {
    const rows = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id AS unit_id, ${UNIT_LABEL} AS unit_label,
               (SELECT string_agg(nullif(trim(concat_ws(' ', us.first_name, us.last_name)), ''), ', ')
                FROM unit_occupancies o JOIN users us ON us.id = o.user_id
                WHERE o.unit_id = u.id AND o.end_date IS NULL AND o.relation = 'owner') AS owner_name,
               (SELECT string_agg(nullif(trim(concat_ws(' ', us.first_name, us.last_name)), ''), ', ')
                FROM unit_occupancies o JOIN users us ON us.id = o.user_id
                WHERE o.unit_id = u.id AND o.end_date IS NULL AND o.relation = 'tenant') AS tenant_name,
               u.ownership_type::text AS ownership_type,
               COALESCE((SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus) FROM debts d
                         WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off','cancelled')), 0) AS balance
        FROM units u LEFT JOIN blocks b ON b.id = u.block_id
        WHERE u.deleted_at IS NULL ${this.blockSql(q.blockId)}
        ORDER BY ${ORDER}
      `)) as unknown as Row[],
    );
    const mapped = rows.map((r) => ({
      unitId: String(r.unit_id),
      unitLabel: String(r.unit_label),
      // Boş: kullanım "boş" işaretli ya da hiç aktif kişi yok.
      occupied: String(r.ownership_type) !== "vacant" && !!(r.owner_name || r.tenant_name),
      ownerName: s(r.owner_name),
      tenantName: s(r.tenant_name),
      balanceMinor: Number(r.balance ?? 0),
    }));
    return {
      rows: mapped.filter((r) => q.state === "all" || (q.state === "empty" ? !r.occupied : r.occupied)),
    };
  }

  async detailed(q: { blockId?: string; member?: MemberScope; search?: string; columns: string[]; reveal: boolean }) {
    if (q.reveal) this.assertReveal("phone");
    const people = await this.people(q);
    const units = (await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT u.id, b.name AS block, u.number, u.floor, u.area_m2, u.land_share, u.resident_count,
               COALESCE((SELECT SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus) FROM debts d
                         WHERE d.unit_id = u.id AND d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off','cancelled')), 0) AS balance
        FROM units u LEFT JOIN blocks b ON b.id = u.block_id WHERE u.deleted_at IS NULL
      `)) as unknown as Row[],
    )).reduce((m, r) => m.set(String(r.id), r), new Map<string, Row>());
    const money = (k: number) => (k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = people.map((p) => {
      const u = units.get(p.unitId) ?? {};
      const value: Record<string, string> = {
        block: s(u.block) ?? "",
        number: s(u.number) ?? "",
        floor: s(u.floor) ?? "",
        area: s(u.area_m2) ?? "",
        landShare: s(u.land_share) ?? "",
        residentCount: s(u.resident_count) ?? "",
        name: p.name,
        relation: (p.former ? "(E) " : "") + (p.relation === "owner" ? "Malik" : "Kiracı"),
        share: p.share ?? "",
        startDate: p.startDate ?? "",
        endDate: p.endDate ?? "",
        phone: p.phone ? (q.reveal ? p.phone : maskPhone(p.phone)) : "",
        email: p.email ?? "",
        balance: money(Number(u.balance ?? 0)),
      };
      return q.columns.map((c) => value[c] ?? "");
    });
    if (q.reveal) {
      await this.audit.record({
        action: "detailed_list_exported",
        resource: "resident",
        diff: { count: { from: null, to: rows.length }, columns: { from: null, to: q.columns.join(",") } },
      });
    }
    return { columns: q.columns, rows };
  }
}
