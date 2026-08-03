import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiExcludeController, ApiOperation } from "@nestjs/swagger";
import { sql } from "drizzle-orm";

import type { PortfolioResponse, PortfolioRow } from "@yonetim/contracts";

import { DbService } from "../infra/db/db.service";

/**
 * Yönetim şirketi portföyü — `/v1/panel/portfolio` (SPEC Bölüm 2.2).
 *
 * TENANT SINIRININ DIŞINDA, ama platform ucu da değil: soru "benim yönettiğim
 * siteler nasıl gidiyor". Kapsam bu yüzden **üyelik**: sorgu yalnız oturumdaki
 * kullanıcının `memberships` satırı olan siteleri döndürüyor. `company_id`
 * üzerinden kurulmadı, çünkü bir yönetici şirkete bağlı olmayan siteleri de
 * yönetiyor olabilir.
 *
 * `@RequirePermission` YOK ve bilinçli: izinler tenant **içi** rolleri
 * anlatıyor, buradaki soru siteler arası. Kapı, sorgunun `user_id = ?`
 * koşulunun kendisi — üyeliği olmayan bir site hiçbir koşulda dönmüyor.
 *
 * TEK SORGU: 20 siteli bir portföyde site başına dört ayrı sorgu atmak 80
 * gidiş-dönüş demekti. Sayaçlar `LATERAL` alt sorgularla tek turda toplanıyor.
 *
 * AYNI SİTEDE BİRDEN ÇOK ROL: bir kullanıcı kendi yönettiği sitede aynı
 * zamanda malik olabilir (geliştirici müdür, sonra daire almış). JOIN
 * `memberships` × `tenants` bu durumda aynı tenant için iki satır üretiyor;
 * UI `tenantId`'yi React key olarak kullanıyor, çakışma crash ediyordu.
 * `DISTINCT ON (t.id)` + role priority ORDER BY ile tenant başına **en
 * yetkili** rol seçilir — `manager + owner` → `manager`. LATERAL
 * agregatları tenant kapsamlı olduğu için DISTINCT sonrası da tutarlı
 * kalıyor.
 */
@ApiExcludeController()
@Controller("v1/panel/portfolio")
export class PortfolioController {
  constructor(private readonly db: DbService) {}

  @Get()
  @ApiOperation({ summary: "Yönettiğim sitelerin özeti" })
  async list(): Promise<PortfolioResponse> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");

    const rows = await this.db.bypass("portfolio:overview", async (tx) => {
      const result = await tx.execute(sql`
        SELECT DISTINCT ON (t.id)
          t.id                                        AS tenant_id,
          t.slug                                      AS slug,
          t.name                                      AS name,
          t.status                                    AS status,
          t.unit_count                                AS unit_count,
          m.role                                      AS role,
          t.trial_ends_at                             AS trial_ends_at,
          COALESCE(d.outstanding, 0)::bigint          AS outstanding,
          COALESCE(d.overdue, 0)::bigint              AS overdue,
          COALESCE(d.due_this_month, 0)::bigint       AS due_this_month,
          COALESCE(d.paid_this_month, 0)::bigint      AS paid_this_month,
          COALESCE(r.open_requests, 0)::int           AS open_requests,
          COALESCE(r.sla_breached, 0)::int            AS sla_breached,
          COALESCE(mt.overdue_maintenance, 0)::int    AS overdue_maintenance
        FROM memberships m
        JOIN tenants t ON t.id = m.tenant_id
        LEFT JOIN LATERAL (
          SELECT
            SUM(amount_kurus + late_fee_kurus - paid_kurus)
              FILTER (WHERE status <> 'paid')                       AS outstanding,
            SUM(amount_kurus + late_fee_kurus - paid_kurus)
              FILTER (WHERE status <> 'paid' AND due_date < NOW())  AS overdue,
            SUM(amount_kurus)
              FILTER (WHERE date_trunc('month', due_date)
                            = date_trunc('month', NOW()))           AS due_this_month,
            SUM(paid_kurus)
              FILTER (WHERE date_trunc('month', due_date)
                            = date_trunc('month', NOW()))           AS paid_this_month
          FROM debts
          WHERE debts.tenant_id = t.id AND debts.deleted_at IS NULL
        ) d ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (
              WHERE status IN ('open', 'assigned', 'in_progress', 'waiting_resident')
            )::int AS open_requests,
            COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL)::int AS sla_breached
          FROM requests
          WHERE requests.tenant_id = t.id AND requests.deleted_at IS NULL
        ) r ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS overdue_maintenance
          FROM maintenance_records
          WHERE maintenance_records.tenant_id = t.id
            AND maintenance_records.deleted_at IS NULL
            AND maintenance_records.is_active = TRUE
            AND maintenance_records.next_due_at < NOW()
        ) mt ON TRUE
        WHERE m.user_id = ${ctx.userId}
          AND t.deleted_at IS NULL
        ORDER BY
          t.id,
          CASE m.role
            WHEN 'company_admin'    THEN 1
            WHEN 'company_operator' THEN 2
            WHEN 'manager'          THEN 3
            WHEN 'auditor'          THEN 4
            WHEN 'accountant'       THEN 5
            WHEN 'staff'            THEN 6
            WHEN 'owner'            THEN 7
            WHEN 'tenant_resident'  THEN 8
            ELSE 99
          END,
          t.name
      `);
      return result as unknown as PortfolioSqlRow[];
    });

    const mapped: PortfolioRow[] = rows.map((row) => {
      const due = Number(row.due_this_month);
      return {
        tenantId: row.tenant_id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        unitCount: Number(row.unit_count),
        role: row.role,
        active: row.tenant_id === ctx.tenantId,
        outstandingMinor: Number(row.outstanding),
        overdueMinor: Number(row.overdue),
        // Borçlandırma yapılmamış ayda oran tanımsız; `%0` yazmak "hiç tahsil
        // edilmedi" demek olurdu ve yanlış olurdu.
        collectionRate: due > 0 ? Number(row.paid_this_month) / due : null,
        openRequestCount: Number(row.open_requests),
        slaBreachedCount: Number(row.sla_breached),
        overdueMaintenanceCount: Number(row.overdue_maintenance),
        trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
      };
    });

    return {
      totals: {
        tenantCount: mapped.length,
        unitCount: mapped.reduce((a, r) => a + r.unitCount, 0),
        outstandingMinor: mapped.reduce((a, r) => a + r.outstandingMinor, 0),
        overdueMinor: mapped.reduce((a, r) => a + r.overdueMinor, 0),
        openRequestCount: mapped.reduce((a, r) => a + r.openRequestCount, 0),
      },
      rows: mapped,
    };
  }
}

interface PortfolioSqlRow {
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  unit_count: number | string;
  role: string;
  trial_ends_at: string | null;
  outstanding: number | string;
  overdue: number | string;
  due_this_month: number | string;
  paid_this_month: number | string;
  open_requests: number | string;
  sla_breached: number | string;
  overdue_maintenance: number | string;
}
