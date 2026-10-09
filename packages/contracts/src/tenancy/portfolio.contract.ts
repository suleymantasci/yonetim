import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Yönetim şirketi portföyü — SPEC Bölüm 2.2 (çoklu site konsolu).
 *
 * NEDEN AYRI BİR UÇ: `company_admin` / `company_operator` rolleri ve
 * `tenants.company_id` alanı baştan beri vardı, ekranı yoktu. Bir yönetim
 * şirketi 20 siteyi yönetiyorsa "hangisinde işler kötü gidiyor" sorusunu
 * bugüne kadar 20 kez site değiştirerek cevaplamak zorundaydı.
 *
 * KAPSAM: kullanıcının **üye olduğu** siteler. `company_id` üzerinden
 * kurulmuyor, çünkü bir yönetici şirkete bağlı olmayan siteleri de yönetiyor
 * olabilir; belirleyici olan üyelik.
 */

export const portfolioRow = z.object({
  tenantId: uuid,
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  unitCount: z.number().int(),
  /** Bu kullanıcının o sitedeki rolü — neye yetkisi olduğunu ekranda gösterir. */
  role: z.string(),
  /** Aktif olarak bakılan site mi. */
  active: z.boolean(),

  outstandingMinor: moneyMinor,
  overdueMinor: moneyMinor,
  /**
   * İçinde bulunulan ayın tahsilat oranı (0–1).
   *
   * Borçlandırma yapılmamış bir sitede oran tanımsız (0/0) ve `null` dönüyor;
   * `%0` yazmak "hiç tahsil edilmedi" demek olurdu ki yanlış.
   */
  collectionRate: z.number().nullable(),
  openRequestCount: z.number().int(),
  slaBreachedCount: z.number().int(),
  overdueMaintenanceCount: z.number().int(),
  /**
   * Bu kullanıcının o sitedeki okunmamış uygulama içi bildirimleri. Bildirim
   * siteye özel; zil yalnız bakılan sitenin bildirimini gösterir — genel durum
   * buradan görülür.
   */
  unreadNotificationCount: z.number().int().default(0),
  /** En yeni okunmamış bildirimin başlığı (yoksa `null`). */
  latestNotificationTitle: z.string().nullable().default(null),
  /** Deneme süresi biten site aksiyon gerektirir. */
  trialEndsAt: dateTime.nullable(),
});

export const portfolioResponse = z.object({
  totals: z.object({
    tenantCount: z.number().int(),
    unitCount: z.number().int(),
    outstandingMinor: moneyMinor,
    overdueMinor: moneyMinor,
    openRequestCount: z.number().int(),
    unreadNotificationCount: z.number().int().default(0),
  }),
  rows: z.array(portfolioRow),
});

export type PortfolioRow = z.infer<typeof portfolioRow>;
export type PortfolioResponse = z.infer<typeof portfolioResponse>;

/**
 * Portföy finans özeti (Y10) — yalnız yönetim rolündeki siteler (malik /
 * kiracı olarak üye olunan sitede kasa görünmez). Kasa + banka bakiyesi
 * kasa ekranıyla aynı yevmiye fişlerinden.
 */
export const portfolioFinance = z.object({
  rows: z.array(
    z.object({
      tenantId: uuid,
      cashMinor: moneyMinor,
      bankMinor: moneyMinor,
      receivableMinor: moneyMinor,
      payableMinor: moneyMinor,
    }),
  ),
});
export type PortfolioFinance = z.infer<typeof portfolioFinance>;

/** Tüm sitelerde üye arama (Y10). */
export const portfolioPeopleQuery = z.object({ q: z.string().trim().min(2).max(60) });
export const portfolioPeople = z.object({
  rows: z.array(
    z.object({
      userId: uuid,
      tenantId: uuid,
      slug: z.string(),
      siteName: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      roles: z.array(z.string()),
      units: z.array(z.string()),
      outstandingMinor: moneyMinor,
    }),
  ),
  truncated: z.boolean(),
});
export type PortfolioPeople = z.infer<typeof portfolioPeople>;
