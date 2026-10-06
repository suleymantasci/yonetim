import { randomBytes } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import { addCalendarMonths } from "@yonetim/core";
import {
  invoices,
  memberships,
  notifications,
  plans,
  subscriptions,
  tenants,
  users,
  withTenant,
} from "@yonetim/db";
import { splitVat } from "@yonetim/pricing";

import { evaluateDunning } from "./dunning";

const DAY_MS = 86_400_000;
/** Havale için makul vade — `PlatformBillingService.assign` ile aynı. */
const INVOICE_DUE_DAYS = 7;
/** Yıllık fiyat artışı sınırı (SPEC 16.7) — `siteConfig.billing.maxYearlyPriceIncreasePct`. */
const maxIncrease = () => 1 + siteConfig.billing.maxYearlyPriceIncreasePct / 100;

/**
 * Faturalama işleri — yenileme, dunning, arşiv tasfiyesi.
 *
 * ÖDEME HÂLÂ MANUEL (2026-10-05 kararı: havale/elden, paket platform
 * panelinden atanıyor). Bu yüzden yenileme **tahsilat denemesi yapmıyor**:
 * yeni dönemin faturasını `issued` olarak kesiyor, aboneliği ileri alıyor.
 * Ödenmezse vade günü `dunning` devralıyor. Online tahsilat gelince yalnız
 * "fatura kes" adımının yanına "kartı çek" eklenecek.
 */

type Locale = "tr" | "en";
const pick = (l: string | null | undefined): Locale => (l === "en" ? "en" : "tr");

const TEXT = {
  renewal_issued: {
    tr: (no: string) => ({ subject: "Yenileme faturası kesildi", body: `${no} numaralı yenileme faturanız kesildi. Vadesine kadar ödeyerek hizmetin kesintisiz sürmesini sağlayın.` }),
    en: (no: string) => ({ subject: "Renewal invoice issued", body: `Invoice ${no} was issued. Pay it by the due date to keep the service uninterrupted.` }),
  },
  subscription_cancelled: {
    tr: () => ({ subject: "Aboneliğiniz sona erdi", body: "İptal talebiniz uyarınca abonelik dönem sonunda sonlandı; site salt-okunur duruma alındı." }),
    en: () => ({ subject: "Your subscription has ended", body: "As requested, the subscription ended at period end; the site is now read-only." }),
  },
  dunning_1: {
    tr: () => ({ subject: "Ödemeniz gecikti", body: "Faturanızın vadesi geçti. Hizmetin kesilmemesi için ödemenizi tamamlayın." }),
    en: () => ({ subject: "Your payment is overdue", body: "Your invoice is past due. Please pay it to avoid service interruption." }),
  },
  dunning_2: {
    tr: () => ({ subject: "Ödeme hatırlatması (3. gün)", body: "Gecikmiş faturanız hâlâ ödenmedi." }),
    en: () => ({ subject: "Payment reminder (day 3)", body: "Your overdue invoice is still unpaid." }),
  },
  dunning_3: {
    tr: () => ({ subject: "Son hatırlatma: 14. günde hesabınız salt-okunur olacak", body: "Ödeme yapılmazsa 14. günde site salt-okunur duruma alınır." }),
    en: () => ({ subject: "Final reminder: read-only at day 14", body: "If unpaid, the site becomes read-only on day 14." }),
  },
  dunning_4: {
    tr: () => ({ subject: "Hesabınız salt-okunur duruma alındı", body: "Ödeme gecikmesi nedeniyle yazma işlemleri durduruldu. Ödeme sonrası otomatik açılır; 30. günde site arşive alınır." }),
    en: () => ({ subject: "Your account is now read-only", body: "Writes are paused due to the overdue payment. It reopens after payment; at day 30 the site is archived." }),
  },
  dunning_5: {
    tr: (days: number) => ({ subject: "Siteniz arşive alındı", body: `Ödeme gecikmesi nedeniyle site arşive alındı. ${days} gün içinde geri açabilirsiniz.` }),
    en: (days: number) => ({ subject: "Your site was archived", body: `The site was archived due to the overdue payment. You can restore it within ${days} days.` }),
  },
} as const;

async function managers(tx: Parameters<Parameters<typeof withTenant>[1]>[0]) {
  return tx
    .select({ userId: memberships.userId, locale: users.locale })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        isNull(memberships.deletedAt),
        inArray(memberships.role, ["manager", "company_admin"]),
        isNull(users.deletedAt),
      ),
    );
}

/** Her yöneticiye tekil (kullanıcı+kaynak+şablon) uygulama içi bildirim. */
async function notify(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  params: {
    tenantId: string;
    template: string;
    resourceType: string;
    resourceId: string;
    text: (locale: Locale) => { subject: string; body: string };
    now: Date;
  },
): Promise<number> {
  let written = 0;
  for (const m of await managers(tx)) {
    const t = params.text(pick(m.locale));
    const inserted = await tx
      .insert(notifications)
      .values({
        tenantId: params.tenantId,
        userId: m.userId,
        channel: "in_app",
        template: params.template,
        subject: t.subject,
        body: t.body,
        params: {},
        recipient: m.userId,
        status: "sent",
        sentAt: params.now,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    written += inserted.length;
  }
  return written;
}

/* -------------------------------------------------------------------------- */
/* billing.renewal                                                            */
/* -------------------------------------------------------------------------- */

export interface RenewalResult {
  tenantId: string;
  action: "none" | "renewed" | "cancelled";
  invoiceNo?: string;
  totalKurus?: number;
  overageCount?: number;
}

/** Takvim ayı farkı — dönem uzunluğunu yeniden üretmek için. */
function monthsBetween(a: Date, b: Date): number {
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

/**
 * `billing.renewal` — dönemi biten aboneliği yeniler.
 *
 *  - `cancelAtPeriodEnd` ise abonelik kapanır, site salt-okunur olur.
 *  - Değilse **aynı uzunlukta** yeni dönem açılır, fatura kesilir, SMS sayacı
 *    sıfırlanır. Fiyat: ilk dönemdeki kampanya/promosyon indirimi yenilemeye
 *    taşınmaz (kilit dönem sonunda bitiyor); liste fiyatı uygulanır ama
 *    önceki fiyatın en fazla `maxYearlyPriceIncreasePct` üstüne çıkamaz.
 *  - SMS aşımı (`kullanılan − plan kotası`) faturaya ayrı kalem olarak biner.
 *    KDV dahil birim fiyatla çarpılıyor (`smsOverageUnitCost`).
 *
 * İDEMPOTENT: dönem aynı işlemde ileri alındığı için ikinci koşu "dönemi
 * bitmiş abonelik" bulamaz; fatura iki kez kesilmez.
 */
export async function renewSubscription(params: { tenantId: string; now?: Date }): Promise<RenewalResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        priceKurus: subscriptions.priceKurus,
        listPriceKurus: subscriptions.listPriceKurus,
        billingPeriod: subscriptions.billingPeriod,
        start: subscriptions.currentPeriodStart,
        end: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        smsUsed: subscriptions.smsUsedThisPeriod,
        smsQuota: plans.smsQuotaYearly,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.tenantId, params.tenantId),
          eq(subscriptions.status, "active"),
          lt(subscriptions.currentPeriodEnd, now),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
      .for("update", { of: subscriptions });

    if (!sub || !sub.end) return { tenantId: params.tenantId, action: "none" as const };

    if (sub.cancelAtPeriodEnd) {
      await tx
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      await tx
        .update(tenants)
        .set({ status: "suspended", suspensionReason: "subscription_cancelled", updatedAt: now })
        .where(eq(tenants.id, params.tenantId));
      await notify(tx, {
        tenantId: params.tenantId,
        template: "subscription_cancelled",
        resourceType: "subscription",
        resourceId: sub.id,
        text: (l) => TEXT.subscription_cancelled[l](),
        now,
      });
      return { tenantId: params.tenantId, action: "cancelled" as const };
    }

    const months = sub.start ? monthsBetween(sub.start, sub.end) : 12;
    const nextEnd = addCalendarMonths(sub.end, months);

    const capped = sub.priceKurus > 0 ? Math.round(sub.priceKurus * maxIncrease()) : sub.listPriceKurus;
    const price = Math.min(sub.listPriceKurus || capped, capped);

    const overageCount = Math.max(0, sub.smsUsed - sub.smsQuota);
    const overageKurus = Math.round(overageCount * siteConfig.billing.smsOverageUnitCost * 100);
    const total = price + overageKurus;
    const { netKurus, vatKurus } = splitVat(total);
    const invoiceNo = `YNT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

    await tx.insert(invoices).values({
      tenantId: params.tenantId,
      subscriptionId: sub.id,
      invoiceNo,
      status: "issued",
      subtotalKurus: netKurus,
      vatKurus,
      totalKurus: total,
      smsOverageCount: overageCount,
      smsOverageKurus: overageKurus,
      periodStart: sub.end,
      periodEnd: nextEnd,
      issuedAt: now,
      dueAt: new Date(now.getTime() + INVOICE_DUE_DAYS * DAY_MS),
      lineItems: [
        { description: `Yenileme (${months} ay)`, amountKurus: price },
        ...(overageCount > 0
          ? [{ description: `SMS kota aşımı × ${overageCount}`, amountKurus: overageKurus }]
          : []),
      ],
    });

    await tx
      .update(subscriptions)
      .set({
        currentPeriodStart: sub.end,
        currentPeriodEnd: nextEnd,
        priceKurus: price,
        priceLockedUntil: nextEnd,
        discountKurus: 0,
        appliedCampaignId: null,
        appliedPromoCode: null,
        smsUsedThisPeriod: 0,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));

    await notify(tx, {
      tenantId: params.tenantId,
      template: `renewal_issued:${invoiceNo}`,
      resourceType: "subscription",
      resourceId: sub.id,
      text: (l) => TEXT.renewal_issued[l](invoiceNo),
      now,
    });

    return { tenantId: params.tenantId, action: "renewed" as const, invoiceNo, totalKurus: total, overageCount };
  });
}

/* -------------------------------------------------------------------------- */
/* billing.dunning                                                            */
/* -------------------------------------------------------------------------- */

export interface DunningResult {
  tenantId: string;
  action: "none" | "step" | "recovered";
  step?: number;
  stepAction?: string;
}

/** Hangi sitenin hangi durumda dunning'e girdiği — tek yerde. */
const RECOVERABLE_SUSPENSIONS = ["payment_overdue"];

/**
 * `billing.dunning` — vadesi geçmiş faturada gecikme gününe göre adım uygular.
 *
 * Gün sayımı **en eski ödenmemiş faturanın vadesinden** başlıyor. Adım
 * sayacı (`subscriptions.dunning_step`) geri gitmiyor, bu yüzden günlük koşu
 * aynı adımı iki kez uygulamıyor (`evaluateDunning` zaten bunu bekliyor).
 *
 * Bildirimler tekil indeksle korunuyor (`dunning_<adım>`).
 *
 * ÖDEME GELDİYSE (ödenmemiş vadesi geçmiş fatura kalmadı, ama abonelik
 * dunning'de): site gecikme yüzünden askıdaysa/`past_due` ise yeniden
 * `active`, sayaç sıfırlanır. Elle askıya alınmış site (`suspensionReason`
 * farklı) **açılmaz**.
 */
export async function runDunning(params: { tenantId: string; now?: Date }): Promise<DunningResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        dunningStep: subscriptions.dunningStep,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, params.tenantId),
          inArray(subscriptions.status, ["active", "past_due", "suspended"]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1)
      .for("update", { of: subscriptions });
    if (!sub) return { tenantId: params.tenantId, action: "none" as const };

    const [oldest] = await tx
      .select({ id: invoices.id, dueAt: invoices.dueAt })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, params.tenantId),
          inArray(invoices.status, ["issued", "overdue"]),
          lt(invoices.dueAt, now),
        ),
      )
      .orderBy(asc(invoices.dueAt))
      .limit(1);

    if (!oldest?.dueAt) {
      if (sub.dunningStep === 0 && sub.status === "active") {
        return { tenantId: params.tenantId, action: "none" as const };
      }
      const [tenant] = await tx
        .select({ status: tenants.status, reason: tenants.suspensionReason })
        .from(tenants)
        .where(eq(tenants.id, params.tenantId));
      const reopen =
        tenant?.status === "past_due" ||
        (tenant?.status === "suspended" && RECOVERABLE_SUSPENSIONS.includes(tenant.reason ?? ""));
      if (reopen) {
        await tx
          .update(tenants)
          .set({ status: "active", suspensionReason: null, updatedAt: now })
          .where(eq(tenants.id, params.tenantId));
      }
      await tx
        .update(subscriptions)
        .set({ status: "active", dunningStep: 0, dunningStartedAt: null, updatedAt: now })
        .where(eq(subscriptions.id, sub.id));
      return { tenantId: params.tenantId, action: "recovered" as const };
    }

    const decision = evaluateDunning({
      firstFailureAt: oldest.dueAt,
      lastStepIndex: sub.dunningStep,
      now,
    });
    if (!decision.step) return { tenantId: params.tenantId, action: "none" as const };

    const stepNo = decision.stepIndex;
    const action = decision.step.action;

    await tx.update(invoices).set({ status: "overdue", updatedAt: now }).where(
      and(eq(invoices.tenantId, params.tenantId), inArray(invoices.status, ["issued"]), lt(invoices.dueAt, now)),
    );

    if (action === "suspend_read_only") {
      await tx
        .update(tenants)
        .set({ status: "suspended", suspensionReason: "payment_overdue", updatedAt: now })
        .where(eq(tenants.id, params.tenantId));
    } else if (action === "archive") {
      const purgeAfterAt = new Date(now.getTime() + siteConfig.billing.archiveRecoveryDays * DAY_MS);
      await tx
        .update(tenants)
        .set({
          status: "archived",
          suspensionReason: "payment_overdue",
          archivedAt: now,
          purgeAfterAt,
          updatedAt: now,
        })
        .where(eq(tenants.id, params.tenantId));
    } else {
      // İlk adımla birlikte site `past_due`: yazma sürüyor ama durum görünür.
      await tx
        .update(tenants)
        .set({ status: sql`CASE WHEN ${tenants.status} = 'active' THEN 'past_due'::tenant_status ELSE ${tenants.status} END`, updatedAt: now })
        .where(eq(tenants.id, params.tenantId));
    }

    const subStatus = action === "archive" ? "archived" : action === "suspend_read_only" ? "suspended" : "past_due";
    await tx
      .update(subscriptions)
      .set({
        status: subStatus,
        dunningStep: stepNo,
        dunningStartedAt: sql`COALESCE(${subscriptions.dunningStartedAt}, ${now.toISOString()}::timestamptz)`,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id));

    const key = `dunning_${stepNo}` as keyof typeof TEXT;
    await notify(tx, {
      tenantId: params.tenantId,
      template: key,
      resourceType: "subscription",
      resourceId: sub.id,
      text: (l) =>
        key === "dunning_5"
          ? TEXT.dunning_5[l](siteConfig.billing.archiveRecoveryDays)
          : (TEXT[key][l] as () => { subject: string; body: string })(),
      now,
    });

    return { tenantId: params.tenantId, action: "step" as const, step: stepNo, stepAction: action };
  });
}

/* -------------------------------------------------------------------------- */
/* billing.archive-purge                                                      */
/* -------------------------------------------------------------------------- */

export interface ArchivePurgeResult {
  tenantId: string;
  purged: boolean;
}

/**
 * `billing.archive-purge` — kurtarma penceresi (`purge_after_at`) dolan
 * arşivli siteyi tasfiye eder.
 *
 * `LifecycleService.purge` ile **aynı sonuç**: site `cancelled` + `deleted_at`,
 * abonelikler kapanır. Veri satırları fiziksel silinmiyor (KVKK imhası ayrı
 * işin konusu). Yalnız arşivdeki ve süresi gerçekten geçmiş site; geri
 * açılmış (status `archived` değil) site etkilenmez.
 */
export async function purgeExpiredArchive(params: { tenantId: string; now?: Date }): Promise<ArchivePurgeResult> {
  const now = params.now ?? new Date();
  return withTenant(params.tenantId, async (tx) => {
    const updated = await tx
      .update(tenants)
      .set({ status: "cancelled", deletedAt: now, landingPublished: false, purgeAfterAt: null, updatedAt: now })
      .where(
        and(
          eq(tenants.id, params.tenantId),
          eq(tenants.status, "archived"),
          isNull(tenants.deletedAt),
          lt(tenants.purgeAfterAt, now),
        ),
      )
      .returning({ id: tenants.id });

    if (updated.length > 0) {
      await tx
        .update(subscriptions)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(subscriptions.tenantId, params.tenantId));
    }
    return { tenantId: params.tenantId, purged: updated.length > 0 };
  });
}
