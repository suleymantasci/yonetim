import { env } from "../config/env";
import { initSentry } from "./sentry";

/**
 * Yan etkili enstrümantasyon — `main.ts`'in **ilk** importlarından biri.
 *
 * Neden ayrı dosya ve neden en üstte: Sentry'nin Nest entegrasyonu modül
 * yüklemeye bağlanıyor. `bootstrap()` içinde kurmak geç kalıyor — `AppModule`
 * o noktada zaten yüklenmiş oluyor ve açılış sırasındaki hatalar hiç
 * yakalanmıyor. `bootstrap-env.ts` ile aynı gerekçe: sıralamayı derleyiciden
 * bağımsız garanti etmenin yolu yan etkili bir modülü ilk sıraya koymak.
 */
const e = env();

export const SENTRY_ENABLED = initSentry({
  dsn: e.SENTRY_DSN,
  environment: e.NODE_ENV,
  service: "api",
  tracesSampleRate: e.SENTRY_TRACES_SAMPLE_RATE,
});
