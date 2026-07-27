import { env } from "@api/infra/config/env";
import { initSentry } from "@api/infra/observability/sentry";

/**
 * Worker enstrümantasyonu — `main.ts`'in ilk importlarından biri.
 *
 * Api ile **aynı** kurulum fonksiyonunu kullanıyor; yalnız `service` etiketi
 * farklı. İki ayrı yapılandırma, KVKK budamasının bir tarafta unutulmasına
 * açık kapı bırakırdı — ve unutulan tarafın worker olması en olası senaryo,
 * çünkü kimse ona bakmıyor.
 */
const e = env();

export const SENTRY_ENABLED = initSentry({
  dsn: e.SENTRY_DSN,
  environment: e.NODE_ENV,
  service: "worker",
  tracesSampleRate: e.SENTRY_TRACES_SAMPLE_RATE,
});
