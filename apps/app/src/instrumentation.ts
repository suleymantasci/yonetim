/**
 * Next enstrümantasyonu — GAP 4.8.1 (MIMARI-PLAN §14 Track D).
 *
 * Next bu dosyayı sunucu başlarken **bir kez** çağırıyor. Çalışma zamanına
 * göre ayrı kurulum gerekiyor: Node ve Edge farklı SDK yollarını kullanıyor ve
 * yanlış olanı yüklemek sessizce hiçbir şey yakalamamaya yol açar.
 *
 * MALİYET NOTU: bu dosya middleware paketini 34 kB'den 118 kB'ye çıkarıyor.
 * Bu **sunucu tarafı** bir paket (edge sandbox), tarayıcıya hiç gitmiyor —
 * bedeli tek seferlik ayrıştırma süresi, ziyaretçi başına indirme değil.
 * Ölçüp bakmadan "middleware büyüdü" diye özelliği kısmak, olmayan bir sorunu
 * çözmek olurdu.
 *
 * DSN yoksa hiçbir şey kurulmuyor: geliştirme kurulumunun ağa çıkmaya
 * çalışan bir kuyruk taşıması gerekmiyor.
 */
export async function register(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Sunucu tarafı render hataları.
 *
 * `onRequestError` Next 15'te RSC ve route handler hatalarını da yakalıyor;
 * `global-error.tsx` yalnız istemcide render edilenleri görüyordu.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; headers: Record<string, string | undefined> },
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.withScope((scope) => {
    scope.setTag("path", request.path);
    // İz kimliği api ve worker ile aynı: tek kullanıcı eylemi üç süreçte de
    // aynı kimlikle aranabilsin (§9.2c).
    const requestId = request.headers["x-request-id"];
    if (requestId) scope.setTag("requestId", requestId);
    Sentry.captureException(error);
  });
}
