import { z } from "zod";

/**
 * Ortam değişkenleri — açılışta bir kez doğrulanır.
 *
 * `FIELD_ENCRYPTION_KEY` burada **zorunlu**: TCKN/IBAN çözme artık yalnız bu
 * process'te mümkün (MIMARI-PLAN §8.3 değişmez 4). `apps/app` bu anahtarı hiç
 * görmez; compose dosyasında da verilmez.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().default(3000),

  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().optional(),
  DATABASE_OWNER_URL: z.string().optional(),

  AUTH_SECRET: z.string().min(8),
  FIELD_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, {
    message: "FIELD_ENCRYPTION_KEY 32 byte hex olmalı (openssl rand -hex 32).",
  }),

  /** Worker → api iç çağrıları için paylaşılan sır (§8.1 dördüncü kimlik yolu). */
  INTERNAL_API_TOKEN: z.string().min(16).optional(),

  /**
   * Zamanlanmış iş tetikleyicisinin sırrı.
   *
   * `INTERNAL_API_TOKEN`'dan ayrı çünkü kapsamları farklı: iç token tek bir
   * tenant bağlamında çalışır, cron **tüm** tenant'ları dolaşır. Aynı sırrı
   * paylaşmak, bir tenant için verilmiş erişimi platform geneline açardı.
   * Tanımlı değilse uç kapalı: sırsız bir cron ucu herkese açık bir cron
   * ucudur.
   */
  CRON_SECRET: z.string().min(16).optional(),

  REDIS_URL: z.string().optional(),
  /** Oturum önbelleği TTL'i, saniye — §17 kararı 5: 60 sn, invalidation'lı. */
  SESSION_CACHE_TTL: z.coerce.number().int().min(0).max(600).default(60),

  /** Mobil access/refresh token ömürleri (§6.1 `mobile-auth`). */
  MOBILE_ACCESS_TTL_MINUTES: z.coerce.number().int().default(15),
  MOBILE_REFRESH_TTL_DAYS: z.coerce.number().int().default(30),

  /** CORS: panel ve sakin portalı aynı origin'den gelir; mobil ayrı. */
  CORS_ORIGINS: z.string().default(""),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  MIGRATIONS_FOLDER: z.string().default("packages/db/drizzle"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[api] Ortam değişkenleri geçersiz:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test yardımcısı: doğrulanmış ortamı sıfırlar. */
export function resetEnvCache(): void {
  cached = undefined;
}
