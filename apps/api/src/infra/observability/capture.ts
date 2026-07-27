import * as Sentry from "@sentry/nestjs";

/**
 * Sentry'ye hata bildirimi — tek geçit.
 *
 * Doğrudan `Sentry.captureException` çağırmak yerine buradan geçmenin nedeni:
 * DSN yoksa SDK kurulmamış olur ve çağrı sessizce kaybolur; bu sorun değil ama
 * **etiketleme** her yerde tekrarlanmak zorunda kalırdı. İz kimliği tek yerde
 * ekleniyor, böylece Sentry'deki hata ile log satırları aynı kimlikten
 * eşleşiyor (app → api → worker).
 */
export function captureException(
  error: unknown,
  context: { requestId?: string; path?: string; job?: string } = {},
): void {
  Sentry.withScope((scope) => {
    if (context.requestId) scope.setTag("requestId", context.requestId);
    if (context.path) scope.setTag("path", context.path);
    if (context.job) scope.setTag("job", context.job);
    Sentry.captureException(error);
  });
}
