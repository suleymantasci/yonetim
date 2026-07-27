import { Controller, Get } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { desc, sql } from "drizzle-orm";

import { assertPlatformAdmin } from "@yonetim/auth/guard";
import type { PlatformOverview } from "@yonetim/contracts";
import type { Role } from "@yonetim/core";
import { campaigns, featureFlags, plans, tenants } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";

/**
 * Platform paneli — `/v1/panel/platform/overview` (SPEC Bölüm 18).
 *
 * TENANT SINIRININ DIŞINDA: platform genelinin sayıları tanımı gereği tek bir
 * siteye ait değil. Bu yüzden `@RequirePermission` yerine `assertPlatformAdmin`
 * kullanılıyor — izin sistemi tenant içindeki rolleri anlatıyor, buradaki soru
 * ise "bu kişi platformun sahibi mi".
 *
 * Kapı **uçta**, ekranda değil: eski hâlinde kontrol render katmanındaydı ve
 * veriyi çeken sorgular ondan bağımsızdı.
 */
@ApiExcludeController()
@Controller("v1/panel/platform")
export class PlatformController {
  constructor(private readonly db: DbService) {}

  @Get("overview")
  async overview(): Promise<PlatformOverview> {
    const ctx = this.db.ctx();
    // Yetkisizde `AppError` fırlatıyor; guard zinciri kimliği zaten çözdü.
    assertPlatformAdmin(ctx.roles as Role[]);

    return this.db.bypass("platform:overview", async (tx) => {
      const tenantStats = (await tx.execute(sql`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'trial')::int AS trial,
               COUNT(*) FILTER (WHERE status = 'active')::int AS active,
               COUNT(*) FILTER (WHERE status = 'past_due')::int AS past_due,
               COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
        FROM tenants WHERE deleted_at IS NULL
      `)) as unknown as Array<{
        total: number;
        trial: number;
        active: number;
        past_due: number;
        suspended: number;
      }>;

      const revenue = (await tx.execute(sql`
        SELECT COALESCE(SUM(price_kurus) / 12, 0)::bigint AS mrr,
               COALESCE(SUM(price_kurus), 0)::bigint AS arr
        FROM subscriptions WHERE status IN ('active','trialing')
      `)) as unknown as Array<{ mrr: string | number; arr: string | number }>;

      const notifyStats = (await tx.execute(sql`
        SELECT COUNT(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS sent,
               COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
               COALESCE(SUM(cost_kurus), 0)::bigint AS cost
        FROM notifications WHERE created_at > now() - interval '30 days'
      `)) as unknown as Array<{
        sent: number;
        failed: number;
        cost: string | number;
      }>;

      const overdueKvkk = (await tx.execute(sql`
        SELECT COUNT(*)::int AS value FROM kvkk_requests
        WHERE status <> 'fulfilled' AND due_at < now()
      `)) as unknown as Array<{ value: number }>;

      const recentTenants = await tx
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          status: tenants.status,
          unitCount: tenants.unitCount,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .orderBy(desc(tenants.createdAt))
        .limit(20);

      const campaignRows = await tx
        .select({
          name: campaigns.name,
          status: campaigns.status,
          usageCount: campaigns.usageCount,
          usageLimit: campaigns.usageLimit,
        })
        .from(campaigns)
        .orderBy(desc(campaigns.usageCount))
        .limit(10);

      const flags = await tx
        .select({
          id: featureFlags.id,
          key: featureFlags.key,
          enabled: featureFlags.enabled,
          rolloutPct: featureFlags.rolloutPct,
        })
        .from(featureFlags)
        .limit(20);

      const planRows = await tx
        .select({
          id: plans.id,
          name: plans.name,
          yearlyPriceKurus: plans.yearlyPriceKurus,
        })
        .from(plans)
        .limit(20);

      const sent = notifyStats[0]?.sent ?? 0;
      const failed = notifyStats[0]?.failed ?? 0;

      return {
        tenants: {
          total: tenantStats[0]?.total ?? 0,
          trial: tenantStats[0]?.trial ?? 0,
          active: tenantStats[0]?.active ?? 0,
          pastDue: tenantStats[0]?.past_due ?? 0,
          suspended: tenantStats[0]?.suspended ?? 0,
        },
        revenue: {
          mrrMinor: Number(revenue[0]?.mrr ?? 0),
          arrMinor: Number(revenue[0]?.arr ?? 0),
        },
        notifications: {
          sent,
          failed,
          // Sıfıra bölme kararı tek yerde: gönderim yoksa oran 0, "NaN" değil.
          failureRate: sent + failed > 0 ? failed / (sent + failed) : 0,
          costMinor: Number(notifyStats[0]?.cost ?? 0),
        },
        overdueKvkkCount: overdueKvkk[0]?.value ?? 0,
        recentTenants,
        campaigns: campaignRows,
        featureFlags: flags,
        plans: planRows.map((p) => ({
          id: p.id,
          name: p.name,
          yearlyPriceMinor: Number(p.yearlyPriceKurus),
        })),
      };
    });
  }
}
