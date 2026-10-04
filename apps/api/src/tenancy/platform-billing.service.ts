import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type {
  CampaignStatusUpdate,
  PlatformCampaignList,
  PlatformPlanList,
  PromoCodeCreate,
  PromoCodeList,
  PromoCodeUpdate,
  SubscriptionAssignRequest,
  SubscriptionAssignResult,
  SubscriptionDiscount,
  SubscriptionQuote,
  SubscriptionQuoteRequest,
} from "@yonetim/contracts";
import { addCalendarMonths, applyPct, roundHalfUp } from "@yonetim/core";
import {
  campaigns,
  invoices,
  plans,
  promoCodeRedemptions,
  promoCodes,
  subscriptions,
  tenants,
  type Database,
} from "@yonetim/db";
import { BILLING_PERIODS, planForUnitCount, splitVat } from "@yonetim/pricing";

import { AuditService } from "../governance/audit/audit.service";
import { ContextResolver } from "../identity/context-resolver.service";
import { DbService } from "../infra/db/db.service";

/** Abonelikte "şu an geçerli" sayılan durumlar — yeni atama bunları kapatır. */
const TRIAL_PLAN_CODE = "trial";

const LIVE_SUBSCRIPTION = ["trialing", "active", "past_due", "grace", "suspended"] as const;

interface PricedQuote extends SubscriptionQuote {
  promoCodeId: string | null;
  promoCodeValue: string | null;
}

/**
 * Platform faturalandırma — manuel paket atama, promosyon kodları, kampanya
 * durumu (2026-10-05 kararı: online ödeme gelene kadar paket platform
 * panelinden atanıyor; havale/elden tahsilat).
 *
 * FİYAT SUNUCUDA: ekran önizleme için `quote` çağırıyor ama `assign` fiyatı
 * yeniden hesaplıyor. Ekrandan gelen tutara güvenmek, eski bir önizlemeyle
 * (kod bu arada tükenmiş, fiyat değişmiş) yanlış faturaya yol açardı.
 *
 * Tüm işlemler platform kapısının arkasında (`PlatformController`) ve
 * `db.bypass` ile: paket kataloğu ve kodlar site sınırının dışında.
 */
@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly resolver: ContextResolver,
  ) {}

  /* ------------------------------------------------------------- paket */

  async plans(tenantId?: string): Promise<PlatformPlanList> {
    return this.db.bypass("platform:plans", async (tx) => {
      const rows = await tx
        .select()
        .from(plans)
        // Deneme planı satılan bir paket değil; atanabilir listede yok.
        .where(and(eq(plans.isActive, true), ne(plans.code, TRIAL_PLAN_CODE)))
        .orderBy(plans.sortOrder, plans.tier);
      let recommendedCode: string | null = null;
      if (tenantId) {
        const [tenant] = await tx.select({ unitCount: tenants.unitCount }).from(tenants).where(eq(tenants.id, tenantId));
        if (tenant) recommendedCode = planForUnitCount(tenant.unitCount).code;
      }
      return {
        rows: rows.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          minUnits: p.minUnits,
          maxUnits: p.maxUnits,
          yearlyPriceMinor: Number(p.yearlyPriceKurus),
          recommended: p.code === recommendedCode,
        })),
      };
    });
  }

  async quote(dto: SubscriptionQuoteRequest): Promise<SubscriptionQuote> {
    const priced = await this.db.bypass("platform:quote", (tx) => this.price(tx, dto, false));
    const { promoCodeId: _id, promoCodeValue: _code, ...quote } = priced;
    return quote;
  }

  async assign(dto: SubscriptionAssignRequest): Promise<SubscriptionAssignResult> {
    const ctx = this.db.ctx();
    const result = await this.db.bypass("platform:assign", async (tx) => {
      const [tenant] = await tx
        .select({ id: tenants.id, status: tenants.status, unitCount: tenants.unitCount, deletedAt: tenants.deletedAt })
        .from(tenants)
        .where(eq(tenants.id, dto.tenantId))
        .for("update");
      if (!tenant || tenant.deletedAt) throw new NotFoundException("not_found");
      if (tenant.status === "archived" || tenant.status === "cancelled")
        throw new ConflictException(`conflict:tenant_${tenant.status}`);

      // Fiyat burada, kilit altında yeniden hesaplanıyor (kod kilitleniyor).
      const priced = await this.price(tx, dto, true);
      if (dto.discount.kind === "promo" && priced.promoError)
        throw new ConflictException(`conflict:promo_${priced.promoError}`);

      const months = priced.months;
      const periodEnd = addCalendarMonths(dto.startsAt, months);
      const now = new Date();

      await tx
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: now })
        .where(and(eq(subscriptions.tenantId, dto.tenantId), inArray(subscriptions.status, [...LIVE_SUBSCRIPTION])));

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          tenantId: dto.tenantId,
          planId: dto.planId,
          status: "active",
          billingPeriod: dto.period,
          processor: "manual",
          unitCountSnapshot: tenant.unitCount,
          priceKurus: priced.finalPriceMinor,
          listPriceKurus: priced.listPriceMinor,
          discountKurus: priced.discountMinor,
          appliedPromoCode: priced.promoCodeValue,
          // Kampanya bitse de bu dönem sonuna kadar fiyat kilitli (SPEC 16.7).
          priceLockedUntil: periodEnd,
          currentPeriodStart: dto.startsAt,
          currentPeriodEnd: periodEnd,
        })
        .returning({ id: subscriptions.id });

      if (priced.promoCodeId) {
        await tx
          .update(promoCodes)
          .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
          .where(eq(promoCodes.id, priced.promoCodeId));
        await tx.insert(promoCodeRedemptions).values({
          promoCodeId: priced.promoCodeId,
          tenantId: dto.tenantId,
          subscriptionId: subscription!.id,
          discountKurus: priced.discountMinor,
        });
      }

      await tx
        .update(tenants)
        .set({ status: "active", planId: dto.planId, suspensionReason: null })
        .where(eq(tenants.id, dto.tenantId));

      const { netKurus, vatKurus } = splitVat(priced.finalPriceMinor);
      const invoiceNo = `YNT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
      const [invoice] = await tx
        .insert(invoices)
        .values({
          tenantId: dto.tenantId,
          subscriptionId: subscription!.id,
          invoiceNo,
          status: dto.markPaid ? "paid" : "issued",
          subtotalKurus: netKurus,
          discountKurus: priced.discountMinor,
          vatKurus,
          totalKurus: priced.finalPriceMinor,
          periodStart: dto.startsAt,
          periodEnd,
          issuedAt: now,
          // Ödenmemişse 7 gün vade — havale için makul süre.
          dueAt: dto.markPaid ? now : new Date(now.getTime() + 7 * 86_400_000),
          paidAt: dto.markPaid ? now : null,
          lineItems: [
            {
              description: `${priced.planName} — ${BILLING_PERIODS[dto.period].label} × ${dto.periodCount}`,
              amountKurus: priced.listPriceMinor,
            },
            ...(priced.discountMinor > 0
              ? [{ description: priced.discountLabel ?? "İndirim", amountKurus: -priced.discountMinor }]
              : []),
          ],
        })
        .returning({ id: invoices.id });

      return {
        subscriptionId: subscription!.id,
        invoiceId: invoice!.id,
        invoiceNo,
        periodEndAt: periodEnd,
        finalPriceMinor: priced.finalPriceMinor,
        discountLabel: priced.discountLabel,
        previousStatus: tenant.status,
      };
    });

    await this.audit.record({
      action: "subscription_assigned",
      resource: "subscription",
      resourceId: result.subscriptionId,
      reason: [
        dto.discount.kind === "special" ? dto.discount.note : null,
        result.discountLabel,
        dto.note,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      diff: {
        tenantStatus: { from: result.previousStatus, to: "active" },
        priceMinor: { from: null, to: result.finalPriceMinor },
      },
    });

    // Askıdaki site açıldıysa oturum önbelleği 60 sn yazmayı engellemesin.
    await this.resolver.invalidateTenantSessions(dto.tenantId).catch((error: unknown) =>
      this.logger.warn({ event: "assign.session_invalidate_failed", tenantId: dto.tenantId, error: String(error) }),
    );

    return {
      subscriptionId: result.subscriptionId,
      invoiceId: result.invoiceId,
      invoiceNo: result.invoiceNo,
      periodEndAt: result.periodEndAt,
      finalPriceMinor: result.finalPriceMinor,
    };
  }

  /**
   * Fiyat: liste (paket × dönem farkı × dönem sayısı) − indirim.
   *
   * Dönem farkı `BILLING_PERIODS` (aylıkta +%10 …) — vitrin fiyatıyla aynı
   * kural; burada ikinci bir tablo yok.
   */
  private async price(tx: Database, dto: SubscriptionQuoteRequest, lock: boolean): Promise<PricedQuote> {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, dto.planId));
    if (!plan) throw new NotFoundException("not_found:plan");
    if (plan.code === TRIAL_PLAN_CODE) throw new BadRequestException("validation_failed:trial_plan_not_assignable");

    const cfg = BILLING_PERIODS[dto.period];
    const listYearly = Number(plan.yearlyPriceKurus);
    const yearlyTotal = listYearly + applyPct(listYearly, cfg.surchargePct);
    const installment = roundHalfUp(yearlyTotal / (12 / cfg.months));
    const list = installment * dto.periodCount;

    const { discount, label, promoCodeId, promoCodeValue, promoError } = await this.discount(
      tx,
      dto.discount,
      dto.tenantId,
      list,
      lock,
    );
    const final = Math.max(0, list - discount);
    return {
      planName: plan.name,
      months: cfg.months * dto.periodCount,
      listPriceMinor: list,
      discountMinor: discount,
      finalPriceMinor: final,
      vatMinor: splitVat(final).vatKurus,
      discountLabel: label,
      promoError,
      promoCodeId,
      promoCodeValue,
    };
  }

  private async discount(
    tx: Database,
    input: SubscriptionDiscount,
    tenantId: string,
    list: number,
    lock: boolean,
  ): Promise<{ discount: number; label: string | null; promoCodeId: string | null; promoCodeValue: string | null; promoError: string | null }> {
    const none = { discount: 0, label: null, promoCodeId: null, promoCodeValue: null, promoError: null };
    if (input.kind === "none") return none;

    if (input.kind === "special") {
      const discount =
        input.type === "percent"
          ? roundHalfUp((list * Math.min(input.value, 100)) / 100)
          : Math.min(list, Math.round(input.value * 100));
      return {
        ...none,
        discount,
        label: input.type === "percent" ? `Özel indirim %${input.value}` : `Özel indirim ${input.value} TL`,
      };
    }

    const query = tx.select().from(promoCodes).where(eq(promoCodes.code, input.code));
    const [code] = lock ? await query.for("update") : await query;
    const now = Date.now();
    const error = !code
      ? "not_found"
      : !code.isActive
        ? "inactive"
        : code.validFrom.getTime() > now
          ? "not_started"
          : code.validUntil.getTime() < now
            ? "expired"
            : code.usageLimit !== null && code.usedCount >= code.usageLimit
              ? "exhausted"
              : code.restrictedToTenantId && code.restrictedToTenantId !== tenantId
                ? "other_tenant"
                : null;
    if (error || !code) return { ...none, promoError: error ?? "not_found" };

    const [used] = await tx
      .select({ id: promoCodeRedemptions.id })
      .from(promoCodeRedemptions)
      .where(and(eq(promoCodeRedemptions.promoCodeId, code.id), eq(promoCodeRedemptions.tenantId, tenantId)))
      .limit(1);
    if (used) return { ...none, promoError: "already_used" };

    const value = Number(code.discountValue);
    const discount =
      code.discountType === "percent"
        ? roundHalfUp((list * Math.min(value, 100)) / 100)
        : Math.min(list, Math.round(value * 100));
    return {
      discount,
      label: code.discountType === "percent" ? `${code.code} (%${value})` : `${code.code} (${value} TL)`,
      promoCodeId: code.id,
      promoCodeValue: code.code,
      promoError: null,
    };
  }

  /* ------------------------------------------------------ promosyon kodu */

  async promoCodes(): Promise<PromoCodeList> {
    return this.db.bypass("platform:promo-list", async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT pc.*,
               t.name AS tenant_name,
               c.name AS campaign_name,
               COALESCE((SELECT SUM(r.discount_kurus) FROM promo_code_redemptions r WHERE r.promo_code_id = pc.id), 0)::bigint
                 AS total_discount
        FROM promo_codes pc
        LEFT JOIN tenants t ON t.id = pc.restricted_to_tenant_id
        LEFT JOIN campaigns c ON c.id = pc.campaign_id
        ORDER BY pc.created_at DESC
        LIMIT 500
      `)) as unknown as Array<Record<string, unknown>>;
      const now = Date.now();
      return {
        rows: rows.map((r) => {
          const validFrom = new Date(r.valid_from as string);
          const validUntil = new Date(r.valid_until as string);
          const usageLimit = r.usage_limit === null ? null : Number(r.usage_limit);
          const usedCount = Number(r.used_count);
          const isActive = Boolean(r.is_active);
          return {
            id: String(r.id),
            code: String(r.code),
            discountType: (r.discount_type === "amount" ? "amount" : "percent") as "percent" | "amount",
            discountValue: Number(r.discount_value),
            validFrom,
            validUntil,
            usageLimit,
            usedCount,
            restrictedToTenantId: (r.restricted_to_tenant_id as string | null) ?? null,
            restrictedToTenantName: (r.tenant_name as string | null) ?? null,
            campaignName: (r.campaign_name as string | null) ?? null,
            isActive,
            usable:
              isActive &&
              validFrom.getTime() <= now &&
              validUntil.getTime() >= now &&
              (usageLimit === null || usedCount < usageLimit),
            totalDiscountMinor: Number(r.total_discount ?? 0),
            createdAt: new Date(r.created_at as string),
          };
        }),
      };
    });
  }

  async createPromoCode(dto: PromoCodeCreate): Promise<{ id: string }> {
    const row = await this.db.bypass("platform:promo-create", async (tx) => {
      const [exists] = await tx.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, dto.code));
      if (exists) throw new ConflictException("conflict:promo_code_taken");
      if (dto.restrictedToTenantId) {
        const [tenant] = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(and(eq(tenants.id, dto.restrictedToTenantId), isNull(tenants.deletedAt)));
        if (!tenant) throw new NotFoundException("not_found:tenant");
      }
      const [inserted] = await tx
        .insert(promoCodes)
        .values({
          code: dto.code,
          discountType: dto.discountType,
          discountValue: String(dto.discountValue),
          validFrom: dto.validFrom,
          validUntil: dto.validUntil,
          usageLimit: dto.usageLimit ?? null,
          restrictedToTenantId: dto.restrictedToTenantId ?? null,
          campaignId: dto.campaignId ?? null,
          isActive: true,
        })
        .returning({ id: promoCodes.id });
      return inserted!;
    });
    await this.audit.record({ action: "promo_code_created", resource: "promo_code", resourceId: row.id, reason: dto.code });
    return { id: row.id };
  }

  async updatePromoCode(id: string, dto: PromoCodeUpdate): Promise<{ id: string }> {
    const updated = await this.db.bypass("platform:promo-update", (tx) =>
      tx
        .update(promoCodes)
        .set({
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.validUntil !== undefined ? { validUntil: dto.validUntil } : {}),
          ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        })
        .where(eq(promoCodes.id, id))
        .returning({ id: promoCodes.id }),
    );
    if (updated.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "promo_code_updated", resource: "promo_code", resourceId: id });
    return { id };
  }

  /* ---------------------------------------------------------- kampanya */

  async campaigns(): Promise<PlatformCampaignList> {
    return this.db.bypass("platform:campaigns", async (tx) => {
      const rows = await tx
        .select({
          id: campaigns.id,
          code: campaigns.code,
          name: campaigns.name,
          type: campaigns.type,
          status: campaigns.status,
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
          usageLimit: campaigns.usageLimit,
          usageCount: campaigns.usageCount,
          showOnPricingPage: campaigns.showOnPricingPage,
          promoCodeCount: sql<number>`(SELECT COUNT(*)::int FROM promo_codes pc WHERE pc.campaign_id = ${campaigns.id})`,
        })
        .from(campaigns)
        .orderBy(desc(campaigns.status), campaigns.name);
      return { rows: rows.map((r) => ({ ...r, promoCodeCount: Number(r.promoCodeCount) })) };
    });
  }

  async setCampaignStatus(id: string, dto: CampaignStatusUpdate): Promise<{ id: string }> {
    const updated = await this.db.bypass("platform:campaign-status", (tx) =>
      tx.update(campaigns).set({ status: dto.status }).where(eq(campaigns.id, id)).returning({ id: campaigns.id }),
    );
    if (updated.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "campaign_status_changed", resource: "campaign", resourceId: id, reason: dto.status });
    return { id };
  }

  /** Atama öncesi doğrulama — kontrolcüden çağrılır. */
  assertStart(startsAt: Date): void {
    const year = 365 * 86_400_000;
    if (Math.abs(startsAt.getTime() - Date.now()) > year)
      throw new BadRequestException("validation_failed:start_out_of_range");
  }
}
