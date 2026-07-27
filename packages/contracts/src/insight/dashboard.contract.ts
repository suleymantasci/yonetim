import { z } from "zod";

import { dateTime, moneyMinor, uuid } from "../_shared/fields";

/**
 * Kontrol paneli sözleşmesi — MIMARI-PLAN §6.4 `insight`, §9a.
 *
 * "BİR EKRAN = BİR ÇAĞRI" (§9a): panel bugün üç ayrı sorgu fonksiyonu
 * çağırıyor (`getDashboardSummary`, `getDashboardCharts`, `getRecentActivity`).
 * HTTP'ye geçerken bunları üç isteğe çevirmek, tek bir sayfa açılışını üç
 * gidiş-dönüşe çıkarırdı. Uç ekran odaklı: özet, grafikler ve aktivite akışı
 * **tek** yanıtta.
 *
 * GRAFİK KARARLARI (GAP 4.3.4) sözleşmeye kadar taşınıyor çünkü şekil
 * kararın kendisi:
 *
 *  1. **Tek eksen kuralı.** Gelir-gider aynı seride çünkü ikisi de kuruş;
 *     tahsilat *oranı* (yüzde) ayrı seride. İki farklı ölçeği iki y ekseniyle
 *     üst üste bindirmek en yaygın grafik hatası.
 *  2. **Nakit akışı tahmini deterministik.** Gelecek 6 ay, açık borçların
 *     vadelerinden ve son 6 ayın **gerçekleşmiş** tahsilat oranından türer.
 *     Model yok, AI yok (SPEC 9.3: aidat hesabında AI yasak) — `assumedRate`
 *     yanıtta dönüyor ki ekran sayının nereden geldiğini yazabilsin.
 */

export const dashboardSummary = z.object({
  unitCount: z.number().int(),
  totalDebtMinor: moneyMinor,
  overdueDebtMinor: moneyMinor,
  collectedThisMonthMinor: moneyMinor,
  accruedThisMonthMinor: moneyMinor,
  /** 0–1 arası oran; ekran yüzdeye çevirir. */
  collectionRate: z.number(),
  expenseThisMonthMinor: moneyMinor,
  openRequests: z.number().int(),
  slaBreached: z.number().int(),
  upcomingMaintenance: z.number().int(),
  lastAnnouncement: z
    .object({ title: z.string(), publishedAt: dateTime.nullable() })
    .nullable(),
});

export type DashboardSummary = z.infer<typeof dashboardSummary>;

export const monthlySeries = z.object({
  /** "2026-07" biçiminde, kronolojik. */
  periods: z.array(z.string()),
  accruedMinor: z.array(moneyMinor),
  collectedMinor: z.array(moneyMinor),
  expenseMinor: z.array(moneyMinor),
  /**
   * %100'ü aşabilir (geçmiş dönem borçlarının tahsilatı). Kırpmıyoruz:
   * grafik doğruyu göstermeli, kırpmak "her şey yolunda" yanılsaması yaratır.
   * Yalnız 200 üstü sınırlanıyor ki tek aylık toplu tahsilat ekseni ezmesin.
   */
  collectionRatePct: z.array(z.number()),
});

export const agingBuckets = z.object({
  labels: z.array(z.string()),
  amounts: z.array(moneyMinor),
});

export const cashForecast = z.object({
  periods: z.array(z.string()),
  /** Gerçekleşen + tahmin; `forecastFrom` indeksinden sonrası tahmin. */
  netMinor: z.array(moneyMinor),
  forecastFrom: z.number().int(),
  /** Tahminde kullanılan tarihsel tahsilat oranı (0–1) — ekranda yazılır. */
  assumedCollectionRate: z.number(),
});

export const dashboardCharts = z.object({
  monthly: monthlySeries,
  aging: agingBuckets,
  forecast: cashForecast,
  collectionSplit: z.object({
    paidMinor: moneyMinor,
    openMinor: moneyMinor,
    overdueMinor: moneyMinor,
  }),
});

export type DashboardCharts = z.infer<typeof dashboardCharts>;

export const activityEntry = z.object({
  id: uuid,
  action: z.string(),
  resource: z.string(),
  resourceId: uuid.nullable(),
  actorName: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: dateTime,
});

export const dashboardResponse = z.object({
  summary: dashboardSummary,
  /**
   * Site boşken (`unitCount === 0`) grafikler **hesaplanmaz** ve `null` döner:
   * boş bir sitede on iki aylık seri üretmek hem anlamsız hem de ekranın
   * gösterdiği tek şey "önce birim ekleyin" boş durumu.
   */
  charts: dashboardCharts.nullable(),
  activity: z.array(activityEntry),
});

export type DashboardResponse = z.infer<typeof dashboardResponse>;

/* ------------------------------------------------------------------ *
 * Kabuk rozetleri
 * ------------------------------------------------------------------ */

/**
 * `GET /v1/panel/shell/badges` — sidebar sayaçları.
 *
 * Beş sayaç **tek sorgu turunda** toplanıyor: her menü öğesi için ayrı uç
 * çağırmak panelin her sayfasında beş gereksiz hop demekti.
 *
 * `slaBreached` ve `overdueMaintenance` sunucuda `now()` ile hesaplanıyor.
 * Saati yanlış kurulmuş bir tarayıcı, "SLA aşıldı mı" sorusunu tam da yanlış
 * cevaplayacak taraftır.
 */
export const navBadges = z.object({
  openRequests: z.number().int(),
  slaBreached: z.number().int(),
  kvkkPending: z.number().int(),
  unmatchedBankTx: z.number().int(),
  overdueMaintenance: z.number().int(),
});

export type NavBadgesResponse = z.infer<typeof navBadges>;
