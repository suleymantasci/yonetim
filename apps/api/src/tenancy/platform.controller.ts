import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { desc, eq, sql } from "drizzle-orm";
import type { Request } from "express";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import { assertPlatformAdmin } from "@yonetim/auth/guard";
import {
  campaignStatusUpdate,
  promoCodeCreate,
  promoCodeUpdate,
  subscriptionAssignRequest,
  subscriptionQuoteRequest,
  type CampaignStatusUpdate,
  type PromoCodeCreate,
  type PromoCodeUpdate,
  type SubscriptionAssignRequest,
  type SubscriptionQuoteRequest,
  impersonateRequest,
  platformAccountAction,
  platformAddonGrant,
  platformExtendRequest,
  platformTenantAction,
  type ImpersonateRequest,
  type ImpersonateResult,
  type PlatformAccountAction,
  type PlatformAccountDetail,
  type PlatformAccountList,
  type PlatformActionResult,
  type PlatformAddonGrant,
  type PlatformExtendRequest,
  type PlatformManagerList,
  type PlatformOverview,
  type PlatformTenantAction,
  type TenantLifecycleResult,
} from "@yonetim/contracts";
import type { Role } from "@yonetim/core";
import { campaigns, featureFlags, plans, tenants } from "@yonetim/db";

import { readCookie } from "../identity/context-resolver.service";
import { AllowArchived, RequirePermission } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { ImpersonationService } from "./impersonation.service";
import { LifecycleService } from "./lifecycle.service";
import { PlatformAccountsService } from "./platform-accounts.service";
import { PlatformBillingService } from "./platform-billing.service";

/**
 * Platform paneli — `/v1/panel/platform/*` (SPEC Bölüm 18).
 *
 * TENANT SINIRININ DIŞINDA: platform genelinin sayıları tanımı gereği tek bir
 * siteye ait değil. Bu yüzden okuma uçlarında `@RequirePermission` yerine
 * `assertPlatformAdmin` kullanılıyor — izin sistemi tenant içindeki rolleri
 * anlatıyor, buradaki soru ise "bu kişi platformun sahibi mi".
 *
 * YAZMA UÇLARI İKİ KAT: hem `assertPlatformAdmin` hem `@RequirePermission`.
 * Sebep, ikisinin farklı soruları cevaplaması: birincisi "platform ekibinden
 * mi", ikincisi "bu **belirli** yetkiye sahip mi". `support_agent` platform
 * rolü ama `admin:impersonate` ve `tenant:delete` izinleri yok — tek katmanla
 * korunsaydı destek personeli hesaba geçebilir ve site silebilirdi.
 *
 * Kapı **uçta**, ekranda değil: eski hâlinde kontrol render katmanındaydı ve
 * veriyi çeken sorgular ondan bağımsızdı.
 */
@ApiExcludeController()
@Controller("v1/panel/platform")
export class PlatformController {
  constructor(
    private readonly db: DbService,
    private readonly accounts: PlatformAccountsService,
    private readonly lifecycle: LifecycleService,
    private readonly impersonation: ImpersonationService,
    private readonly billing: PlatformBillingService,
  ) {}

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
        FROM tenants WHERE deleted_at IS NULL AND is_demo = false
      `)) as unknown as Array<{
        total: number;
        trial: number;
        active: number;
        past_due: number;
        suspended: number;
      }>;

      /*
       * MRR/ARR yalnız **tahsil edilebilir** aboneliklerden.
       *
       * `trialing` bilerek çıkarıldı: deneme aboneliğinin `price_kurus` alanı
       * dolu (deneme bitiminde gösterilecek tutar orada sabitleniyor) ama o
       * para henüz gelir değil. Sorgu bugüne kadar `trialing`'i de topluyordu
       * ve yanlış görünmüyordu — çünkü `subscriptions` tablosuna yazan hiçbir
       * kod yoktu, toplam her koşulda 0'dı. Yazma yolu açılınca (kurulumda
       * deneme aboneliği) bu hata anında gerçek bir rakama dönüşürdü:
       * denemedeki her hesap MRR'a eklenirdi.
       *
       * `past_due` ve `grace` **dahil**: fatura kesilmiş, tahsilat gecikmiş.
       * Onları düşürmek MRR'ı bir ödeme aksaklığında olduğundan düşük
       * gösterirdi.
       */
      const revenue = (await tx.execute(sql`
        SELECT COALESCE(SUM(price_kurus) / 12, 0)::bigint AS mrr,
               COALESCE(SUM(price_kurus), 0)::bigint AS arr
        FROM subscriptions WHERE status IN ('active','past_due','grace')
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
        .where(eq(tenants.isDemo, false))
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

  /* --------------------------------------------------------- hesaplar */

  @Get("accounts")
  async accountList(
    @Query("q") query?: string,
    @Query("durum") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<PlatformAccountList> {
    this.assertPlatform();
    return this.accounts.list({
      query: query?.trim() || undefined,
      status: status?.trim() || undefined,
      // Üst sınır sunucuda: istemciden gelen `limit` sınırsız olsaydı tek
      // istek bütün hesapları çeken bir ihraç ucuna dönüşürdü.
      limit: Math.min(Math.max(Number(limit ?? 50) || 50, 1), 200),
      offset: Math.max(Number(offset ?? 0) || 0, 0),
    });
  }

  @Get("managers")
  async managerList(
    @Query("q") query?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<PlatformManagerList> {
    this.assertPlatform();
    return this.accounts.managers({
      query: query?.trim() || undefined,
      limit: Math.min(Math.max(Number(limit ?? 100) || 100, 1), 200),
      offset: Math.max(Number(offset ?? 0) || 0, 0),
    });
  }

  @Get("accounts/:key")
  async accountDetail(@Param("key") key: string): Promise<PlatformAccountDetail> {
    this.assertPlatform();
    return this.accounts.detail(key);
  }

  /* ------------------------------------------------------- aksiyonlar */

  @Post("subscriptions/extend")
  @RequirePermission("admin:billing")
  async extend(
    @Body(new ZodBodyPipe(platformExtendRequest)) dto: PlatformExtendRequest,
  ): Promise<PlatformActionResult> {
    this.assertPlatform();
    const result = await this.accounts.extend(dto);
    return { ok: true, affected: result.affected };
  }

  @Post("accounts/action")
  @RequirePermission("admin:tenants")
  async accountAction(
    @Body(new ZodBodyPipe(platformAccountAction)) dto: PlatformAccountAction,
  ): Promise<PlatformActionResult> {
    this.assertPlatform();
    const result = await this.accounts.accountAction(dto);
    return { ok: true, affected: result.affected };
  }

  @Post("addons/grant")
  @RequirePermission("admin:billing")
  async grantAddon(
    @Body(new ZodBodyPipe(platformAddonGrant)) dto: PlatformAddonGrant,
  ): Promise<PlatformActionResult> {
    this.assertPlatform();
    const result = await this.accounts.grantAddon(dto);
    return { ok: true, affected: result.affected };
  }

  /* ------------------------------------------------ paket / faturalandırma */

  @Get("plans")
  async planList(@Query("tenantId") tenantId?: string) {
    this.assertPlatform();
    return this.billing.plans(tenantId && /^[0-9a-f-]{36}$/i.test(tenantId) ? tenantId : undefined);
  }

  /** Önizleme — kod kilitlenmez, kayıt yazılmaz. */
  @Post("subscriptions/quote")
  @RequirePermission("admin:billing")
  async quote(@Body(new ZodBodyPipe(subscriptionQuoteRequest)) dto: SubscriptionQuoteRequest) {
    this.assertPlatform();
    return this.billing.quote(dto);
  }

  /**
   * Manuel paket atama — havale/elden tahsilat sonrası. Fiyat sunucuda yeniden
   * hesaplanır; önceki canlı abonelik kapanır, site aktifleşir, fatura yazılır.
   */
  @Post("subscriptions/assign")
  @RequirePermission("admin:billing")
  async assign(@Body(new ZodBodyPipe(subscriptionAssignRequest)) dto: SubscriptionAssignRequest) {
    this.assertPlatform();
    this.billing.assertStart(dto.startsAt);
    return this.billing.assign(dto);
  }

  @Get("promo-codes")
  async promoCodeList() {
    this.assertPlatform();
    return this.billing.promoCodes();
  }

  @Post("promo-codes")
  @RequirePermission("admin:billing")
  async createPromoCode(@Body(new ZodBodyPipe(promoCodeCreate)) dto: PromoCodeCreate) {
    this.assertPlatform();
    return this.billing.createPromoCode(dto);
  }

  @Patch("promo-codes/:id")
  @RequirePermission("admin:billing")
  async updatePromoCode(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(promoCodeUpdate)) dto: PromoCodeUpdate,
  ) {
    this.assertPlatform();
    return this.billing.updatePromoCode(id, dto);
  }

  @Get("campaigns")
  async campaignList() {
    this.assertPlatform();
    return this.billing.campaigns();
  }

  @Patch("campaigns/:id/status")
  @RequirePermission("admin:billing")
  async campaignStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBodyPipe(campaignStatusUpdate)) dto: CampaignStatusUpdate,
  ) {
    this.assertPlatform();
    return this.billing.setCampaignStatus(id, dto);
  }

  /* ------------------------------------------------- site yaşam döngüsü */

  @Post("tenants/archive")
  @RequirePermission("admin:tenants")
  async archiveTenant(
    @Body(new ZodBodyPipe(platformTenantAction)) dto: PlatformTenantAction,
  ): Promise<TenantLifecycleResult> {
    this.assertPlatform();
    return this.lifecycle.archive(dto.reason, dto.tenantId);
  }

  /** `@AllowArchived()`: istek tanımı gereği arşivlenmiş siteye yazıyor. */
  @Post("tenants/restore")
  @RequirePermission("admin:tenants")
  @AllowArchived()
  async restoreTenant(
    @Body(new ZodBodyPipe(platformTenantAction)) dto: PlatformTenantAction,
  ): Promise<TenantLifecycleResult> {
    this.assertPlatform();
    return this.lifecycle.restore(dto.reason, dto.tenantId);
  }

  /**
   * Kalıcı silme — `tenant:delete`, yani **yalnız** `super_admin`.
   *
   * `admin:tenants` yeterli sayılmadı: o izin `support_agent`'ta da var ve
   * destek personelinin site listesini yönetmesi ile bir sitenin tüm
   * geçmişini imha etmesi aynı sorumluluk değil.
   */
  @Post("tenants/purge")
  @RequirePermission("tenant:delete")
  @AllowArchived()
  async purgeTenant(
    @Body(new ZodBodyPipe(platformTenantAction)) dto: PlatformTenantAction,
  ): Promise<TenantLifecycleResult> {
    this.assertPlatform();
    return this.lifecycle.purge(dto.reason, dto.tenantId);
  }

  /* ------------------------------------------------------ impersonation */

  /**
   * Hesaba geçiş — `admin:impersonate`, yani yalnız `super_admin`.
   *
   * Dönen jetonu çereze **`apps/app` koyuyor**: çerezi burada kurmak, API'nin
   * panelin çerez politikasını (ad, `SameSite`, alan adı) bilmesini
   * gerektirirdi ve iki uygulamanın çerez kuralı iki yerde yaşardı.
   */
  @Post("impersonate")
  @RequirePermission("admin:impersonate")
  async impersonate(
    @Body(new ZodBodyPipe(impersonateRequest)) dto: ImpersonateRequest,
  ): Promise<ImpersonateResult> {
    this.assertPlatform();
    return this.impersonation.start(dto);
  }

  /**
   * Geçişi bitir.
   *
   * `assertPlatform()` **yok** ve olamaz: bu çağrı impersonation oturumuyla,
   * yani müşterinin kimliğiyle geliyor — o oturumun platform rolü bulunmuyor.
   * Kapı bunun yerine bağlamdaki `impersonatedBy` alanı: dolu değilse
   * `ImpersonationService` isteği reddediyor. Kendi oturumunu kapatmak isteyen
   * kullanıcı için `/api/session/logout` var.
   */
  @Post("impersonate/stop")
  async stopImpersonation(@Req() req: Request): Promise<{ ok: true }> {
    /*
     * Jeton bağlamdan değil **çerezden** okunuyor: ham oturum jetonunu
     * `RequestContext`'e koymak, onu her servisin, her log satırının ve her
     * hata yolunun erişebileceği bir yere taşımak olurdu. Silinecek oturumu
     * bilmek yalnız bu ucun ihtiyacı.
     */
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) return { ok: true };
    return this.impersonation.stop(token);
  }

  /**
   * Platform rolü kontrolü — okuma ve yazma uçlarının ortak ilk kapısı.
   *
   * `@RequirePermission` tek başına yetmiyor çünkü izin matrisi tenant
   * rollerini de kapsıyor: bir sitenin `manager`'ı `admin:*` izinlerine sahip
   * değil ama gelecekte bir izin yanlışlıkla `MANAGER_PERMS`'e eklenirse, bu
   * kontrol ikinci duvar olarak durur.
   */
  private assertPlatform(): void {
    const ctx = this.db.ctx();
    assertPlatformAdmin(ctx.roles as Role[]);
  }
}
