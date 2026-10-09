import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { ApiExcludeController, ApiOperation } from "@nestjs/swagger";
import { sql } from "drizzle-orm";

import type { PortfolioFinance } from "@yonetim/contracts";

import { DbService } from "../../infra/db/db.service";
import { isCashCode, loadJournal } from "../accounting/journal";
import { balancesAt } from "../accounting/statements";

/** Kasa bakiyesini görebilen roller (kasa ekranı `bank:read`). */
const FINANCE_ROLES = ["company_admin", "company_operator", "manager", "accountant", "auditor"];

/**
 * Portföy finans özeti — `/v1/panel/portfolio/finance`.
 *
 * Site listesi `bypass` ile **yalnız üyelikten** bulunuyor (portföy ucuyla
 * aynı kapı); her sitenin hesabı ise o sitenin RLS bağlamında
 * (`tenantScoped`) — `tx()` burada kullanılamaz, bakılan site tek. Rol
 * süzgeci yönetim rolleri: malik olarak üye olunan sitenin kasası görünmez.
 */
@ApiExcludeController()
@Controller("v1/panel/portfolio/finance")
export class PortfolioFinanceController {
  constructor(private readonly db: DbService) {}

  @Get()
  @ApiOperation({ summary: "Yönettiğim sitelerin kasa / alacak / ödenecek özeti" })
  async list(): Promise<PortfolioFinance> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    const tenants = (await this.db.bypass("portfolio:finance", (tx) =>
      tx.execute(sql`
        SELECT DISTINCT m.tenant_id FROM memberships m JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = ${ctx.userId} AND m.deleted_at IS NULL AND t.deleted_at IS NULL
          AND m.role::text IN (${sql.join(FINANCE_ROLES.map((r) => sql`${r}`), sql`, `)})
      `),
    )) as unknown as { tenant_id: string }[];

    const rows = [];
    for (const { tenant_id: tenantId } of tenants) {
      rows.push(
        await this.db.tenantScoped(tenantId, ctx.userId, async (tx) => {
          const now = new Date();
          const balances = balancesAt(await loadJournal(tx, now), now);
          let bank = 0;
          for (const [code, v] of balances) if (isCashCode(code) && code.startsWith("102.")) bank += v;
          const [r] = (await tx.execute(sql`
            SELECT
              (SELECT coalesce(sum(amount_kurus + late_fee_kurus - paid_kurus), 0) FROM debts
                WHERE deleted_at IS NULL AND status NOT IN ('paid', 'written_off', 'cancelled')) AS receivable,
              (SELECT coalesce(sum(amount_kurus), 0) FROM expenses
                WHERE deleted_at IS NULL AND status IN ('approved', 'pending_approval') AND paid_at IS NULL) AS payable
          `)) as unknown as { receivable: string; payable: string }[];
          return {
            tenantId,
            cashMinor: balances.get("100") ?? 0,
            bankMinor: bank,
            receivableMinor: Number(r?.receivable ?? 0),
            payableMinor: Number(r?.payable ?? 0),
          };
        }),
      );
    }
    return { rows };
  }
}
