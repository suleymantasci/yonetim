import { NextResponse } from "next/server";

/**
 * Web Vitals toplama ucu — GAP 4.8.2.
 *
 * Kimlik gerektirmiyor: ölçüm giriş yapmamış kullanıcıdan da geliyor (giriş
 * sayfasının LCP'si de bir performans verisi). Karşılığında **hiçbir** kişisel
 * veri kabul edilmiyor — gövde şemayla daraltılıyor ve şemada olmayan alan
 * sessizce düşüyor.
 *
 * Bugün log'a yazıyor: yapılandırılmış log zaten toplanıyor ve p75 sorgusu
 * oradan çıkarılabiliyor. Ayrı bir zaman serisi deposu (Prometheus) eklemek
 * bu ölçekte erken olurdu; eklendiğinde değişecek tek yer burası.
 */
export const dynamic = "force-dynamic";

const METRICS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const metric = body as { name?: unknown; value?: unknown; rating?: unknown; path?: unknown };
  if (typeof metric.name !== "string" || !METRICS.has(metric.name)) {
    return new NextResponse(null, { status: 204 });
  }
  if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
    return new NextResponse(null, { status: 204 });
  }

  // Next route handler'ında pino yok; yapılandırılmış log tek satır JSON
  // olarak stdout'a yazılıyor ve Docker log sürücüsü onu topluyor.
  // `warn`/`error` kullanmak seviyeyi yanlış gösterirdi: bu bir ölçüm,
  // bir sorun değil.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "web_vital",
      name: metric.name,
      value: Math.round(metric.value),
      rating: typeof metric.rating === "string" ? metric.rating : null,
      // İstemci şablona indirgemiş olmalı; yine de burada kırpılıyor çünkü
      // istemciden gelen hiçbir şeye güvenilmez.
      path: typeof metric.path === "string" ? metric.path.slice(0, 120) : null,
    }),
  );

  // 204: istemcinin bu yanıtla yapacağı bir şey yok ve `sendBeacon` zaten
  // gövdeyi okumuyor.
  return new NextResponse(null, { status: 204 });
}
