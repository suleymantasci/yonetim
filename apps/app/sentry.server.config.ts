import * as Sentry from "@sentry/nextjs";

/**
 * Next sunucu tarafı Sentry — GAP 4.8.1.
 *
 * KVKK: `sendDefaultPii` **kapalı** ve istek gövdesi budanıyor. Bir apartman
 * yönetim sisteminde varsayılan toplama, sakinlerin TCKN'si ve telefonunun
 * üçüncü taraf bir servise gitmesi demektir (md.4 ölçülülük).
 *
 * `apps/api`'deki kurulumla aynı ilkeler; ayrı dosya olmasının nedeni SDK'nın
 * farklı olması (`@sentry/nextjs` vs `@sentry/nestjs`), farklı bir politika
 * değil.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  initialScope: { tags: { service: "app" } },
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      if (event.request.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
    }
    return event;
  },
});
