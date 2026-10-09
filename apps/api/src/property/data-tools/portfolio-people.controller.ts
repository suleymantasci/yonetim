import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiExcludeController, ApiOperation } from "@nestjs/swagger";
import { sql } from "drizzle-orm";

import { portfolioPeopleQuery, type PortfolioPeople } from "@yonetim/contracts";
import { maskPhone } from "@yonetim/core";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { ZodQueryPipe } from "../../infra/zod/zod-dto";

const MANAGE_ROLES = ["company_admin", "company_operator", "manager", "accountant"];
const LIMIT = 50;

/**
 * Tüm sitelerde üye arama — Yönetimcell Pro "üye arama". Kapsam: kullanıcının
 * **yönetim rolüyle** üye olduğu siteler (portföy kapısı: üyelik). Ad, soyad,
 * e-posta ya da telefon rakamlarıyla; telefon maskeli döner. Arama denetim
 * kaydına yazılır (siteler arası kişisel veri erişimi).
 */
@ApiExcludeController()
@Controller("v1/panel/portfolio/people")
export class PortfolioPeopleController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Yönettiğim tüm sitelerde kişi ara" })
  async search(@Query(new ZodQueryPipe(portfolioPeopleQuery)) q: { q: string }): Promise<PortfolioPeople> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const digits = q.q.replace(/\D/g, "");
    const rows = (await this.db.bypass("portfolio:people-search", (tx) =>
      tx.execute(sql`
        WITH sites AS (
          SELECT DISTINCT m.tenant_id FROM memberships m JOIN tenants t ON t.id = m.tenant_id
          WHERE m.user_id = ${ctx.userId} AND m.deleted_at IS NULL AND t.deleted_at IS NULL
            AND m.role::text IN (${sql.join(MANAGE_ROLES.map((r) => sql`${r}`), sql`, `)})
        )
        SELECT us.id AS user_id, t.id AS tenant_id, t.slug, t.name AS site_name,
               coalesce(nullif(trim(concat_ws(' ', us.first_name, us.last_name)), ''), us.email, '—') AS name,
               us.phone, array_agg(DISTINCT m.role::text) AS roles,
               (SELECT array_agg(DISTINCT CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END)
                  FROM unit_occupancies o JOIN units u ON u.id = o.unit_id LEFT JOIN blocks b ON b.id = u.block_id
                 WHERE o.tenant_id = t.id AND o.user_id = us.id AND (o.end_date IS NULL OR o.end_date > now())) AS units,
               (SELECT coalesce(sum(d.amount_kurus + d.late_fee_kurus - d.paid_kurus), 0) FROM debts d
                 WHERE d.tenant_id = t.id AND d.debtor_user_id = us.id AND d.deleted_at IS NULL
                   AND d.status NOT IN ('paid', 'written_off', 'cancelled')) AS outstanding
        FROM sites s
        JOIN tenants t ON t.id = s.tenant_id
        JOIN memberships m ON m.tenant_id = t.id AND m.deleted_at IS NULL
        JOIN users us ON us.id = m.user_id
        WHERE concat_ws(' ', us.first_name, us.last_name) ILIKE ${like}
           OR us.email ILIKE ${like}
           ${digits.length >= 4 ? sql`OR regexp_replace(coalesce(us.phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}` : sql``}
        GROUP BY us.id, t.id, t.slug, t.name
        ORDER BY name, t.name
        LIMIT ${LIMIT + 1}
      `),
    )) as unknown as Record<string, unknown>[];
    await this.audit.record({ action: "portfolio_people_searched", resource: "resident", reason: `q=${q.q.slice(0, 40)} n=${rows.length}` });
    return {
      rows: rows.slice(0, LIMIT).map((r) => ({
        userId: String(r.user_id),
        tenantId: String(r.tenant_id),
        slug: String(r.slug),
        siteName: String(r.site_name),
        name: String(r.name),
        phone: r.phone ? maskPhone(String(r.phone)) : null,
        roles: (r.roles as string[]) ?? [],
        units: ((r.units as string[] | null) ?? []).filter(Boolean),
        outstandingMinor: Number(r.outstanding ?? 0),
      })),
      truncated: rows.length > LIMIT,
    };
  }
}
