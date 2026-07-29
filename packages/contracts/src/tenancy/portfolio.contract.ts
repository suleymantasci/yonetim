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
  }),
  rows: z.array(portfolioRow),
});

export type PortfolioRow = z.infer<typeof portfolioRow>;
export type PortfolioResponse = z.infer<typeof portfolioResponse>;
