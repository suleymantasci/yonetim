/**
 * Yeniden deneme + devre kesici — SPEC Bölüm 3.10 (çoklu banka failover),
 * Bölüm 22 (tek sağlayıcı bağımlılığı riski).
 */

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  isRetryable?: (error: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 300,
    maxDelayMs = 10_000,
    jitter = true,
    onRetry,
    isRetryable = () => true,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) break;
      const exp = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delay = jitter ? Math.round(exp * (0.5 + Math.random() * 0.5)) : exp;
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CircuitState = "closed" | "open" | "half_open";

/**
 * Basit devre kesici: N ardışık hata → devre açılır, cooldown sonrası half-open.
 * Ödeme/banka/SMS sağlayıcıları için failover kararında kullanılır.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    readonly name: string,
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  get state(): CircuitState {
    if (this.openedAt === null) return "closed";
    return Date.now() - this.openedAt >= this.cooldownMs ? "half_open" : "open";
  }

  canAttempt(): boolean {
    return this.state !== "open";
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = Date.now();
  }
}

/**
 * Sağlayıcı zinciri: sırayla dener, ilk başarılı olanı döner.
 * Tüm sağlayıcılar başarısızsa son hatayı fırlatır.
 */
export async function failover<TProvider, TResult>(
  providers: TProvider[],
  run: (provider: TProvider) => Promise<TResult>,
  opts: {
    breakers?: Map<TProvider, CircuitBreaker>;
    onFailure?: (provider: TProvider, error: unknown) => void;
  } = {},
): Promise<{ result: TResult; provider: TProvider; attempts: number }> {
  let lastError: unknown = new Error("Hiçbir sağlayıcı tanımlı değil.");
  let attempts = 0;
  for (const provider of providers) {
    const breaker = opts.breakers?.get(provider);
    if (breaker && !breaker.canAttempt()) continue;
    attempts++;
    try {
      const result = await run(provider);
      breaker?.recordSuccess();
      return { result, provider, attempts };
    } catch (error) {
      lastError = error;
      breaker?.recordFailure();
      opts.onFailure?.(provider, error);
    }
  }
  throw lastError;
}
