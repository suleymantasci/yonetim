"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Core Web Vitals ölçümü — GAP 4.8.2 (MIMARI-PLAN §14 Track D).
 *
 * NEDEN SENTRY'YE DEĞİL, KENDİ UCUMUZA: Web Vitals bir hata değil, bir
 * dağılım. Sentry'de olay başına saklamak hem pahalı hem yanlış araç; asıl
 * soru "p75 LCP kaç" ve bu ancak toplulaştırılmış veriyle cevaplanıyor.
 *
 * ÖLÇÜM İSTEMCİDE, KARAR SUNUCUDA: gönderilen tek şey metrik adı ve değeri.
 * Sayfa yolu **şablon** olarak gidiyor (`/panel/borclar/[id]`), gerçek kimlik
 * değil — bir daire kimliği metrik etiketine düşerse, performans verisi kimin
 * hangi daireye baktığını sızdıran bir kayda dönüşürdü (KVKK md.4).
 *
 * `sendBeacon`: sayfa kapanırken bile gidiyor ve ana iş parçacığını
 * bloklamıyor. `fetch` ile gönderseydik, ölçümün kendisi ölçülen şeyi
 * bozardı.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (!navigator.sendBeacon) return;

    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
      path: templatePath(window.location.pathname),
    });

    navigator.sendBeacon("/api/vitals", body);
  });

  return null;
}

/**
 * Yoldaki kimlikleri şablona indirger: `/panel/borclar/9f3a…` → `/panel/borclar/[id]`.
 *
 * UUID ve sayı segmentleri maskeleniyor. Maskelemeseydik metrik etiketleri
 * sınırsız sayıda ayrı değere bölünür (kardinalite patlaması) ve toplulaştırma
 * anlamsızlaşırdı — gizlilik gerekçesinin yanında pratik bir gerekçe de var.
 */
function templatePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      /^\d+$/.test(segment)
        ? "[id]"
        : segment,
    )
    .join("/");
}
