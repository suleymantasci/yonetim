import { ConflictException } from "@nestjs/common";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { plans, subscriptions, tenants, units } from "@yonetim/db";

import type { Database } from "./types";

/** Paket sınırının geçerli olduğu abonelik durumları (ödenmiş ya da tahsilatı süren). */
const PAID_SUBSCRIPTION = ["active", "past_due", "grace"] as const;

/**
 * Paket daire sınırı — daire sayısını artıran her yazma bunu **aynı işlemde**
 * insert'ten önce çağırır (tekli/toplu ekleme, geri yükleme, göç, dış API).
 *
 * - Demo hesap ve süresi dolmamış deneme: sınır yok, istediği kadar veri girer.
 * - Deneme bitti / paket atanmamış: yeni daire eklenemez (`unit_limit_no_plan`).
 * - Paket var: silinmemiş daire + eklenecek ≤ `plans.max_units` (null = sınırsız,
 *   kurumsal).
 *
 * Mevcut fazla daireler silinmiyor: denemede 50 daire açıp 30'luk paket alan
 * sitenin verisi durur, yalnız yenisi eklenemez. Paket atama ekranı zaten
 * daire sayısından küçük paketi reddediyor (`PlatformBillingService.assign`).
 *
 * Site satırı `FOR UPDATE` ile kilitleniyor: aynı anda iki toplu ekleme
 * sayımı birlikte geçip sınırı aşamasın.
 */
export async function assertUnitQuota(
  tx: Database,
  tenantId: string,
  adding: number,
  now: Date = new Date(),
): Promise<void> {
  if (adding <= 0) return;

  const [tenant] = await tx
    .select({
      status: tenants.status,
      isDemo: tenants.isDemo,
      trialEndsAt: tenants.trialEndsAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for("update");
  if (!tenant) throw new ConflictException("conflict:unit_limit_no_plan");
  if (tenant.isDemo) return;
  // Deneme bitişi iş kuyruğunu beklemeden geçerli: `billing.trial-expiry`
  // gecikse de süresi dolan deneme sınırsız kalmaz.
  if (
    tenant.status === "trial" &&
    (!tenant.trialEndsAt || tenant.trialEndsAt > now)
  )
    return;

  const [sub] = await tx
    .select({ maxUnits: plans.maxUnits })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        inArray(subscriptions.status, [...PAID_SUBSCRIPTION]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!sub) throw new ConflictException("conflict:unit_limit_no_plan");
  if (sub.maxUnits === null) return;

  const [row] = await tx
    .select({ n: count() })
    .from(units)
    .where(and(eq(units.tenantId, tenantId), isNull(units.deletedAt)));
  if ((row?.n ?? 0) + adding > sub.maxUnits) {
    throw new ConflictException("conflict:unit_limit");
  }
}
