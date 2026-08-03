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

  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET en az 32 karakter olmalı (brute-force'a dayanıklı).")
    .refine((v) => v !== "dev-only-insecure-secret-change-me", {
      message:
        "AUTH_SECRET hâlâ bilinen geliştirme varsayılan değerinde — üretimde değiştirin.",
    }),
  FIELD_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, {
      message:
        "FIELD_ENCRYPTION_KEY 32 byte hex olmalı (openssl rand -hex 32).",
    })
    .refine((v) => v !== "0".repeat(64), {
      message:
        "FIELD_ENCRYPTION_KEY varsayılan sıfır değer; openssl rand -hex 32 ile üretin.",
    })
    .refine((v) => new Set(v.toLowerCase()).size >= 16, {
      message:
        "FIELD_ENCRYPTION_KEY yeterli entropi taşımıyor; tekrar eden karakterlerden oluşuyor.",
    }),

  /** Worker → api iç çağrıları için paylaşılan sır (§8.1 dördüncü kimlik yolu). */
  INTERNAL_API_TOKEN: z.string().min(16).optional(),

  /**
   * Girişte parolanın ardından tek kullanımlık kod da sorulsun mu?
   *
   * `false` (varsayılan): parola doğruysa oturum hemen açılır.
   * `true`: parola doğruysa kimliğin kanalına (telefon → SMS, e-posta → posta)
   * 6 haneli kod gider ve oturum ancak ikinci adımda açılır.
   *
   * VARSAYILAN NEDEN KAPALI: kod göndermek bir SMS sağlayıcısı gerektiriyor ve
   * yapılandırılmamış kurulumda `packages/sms` konsola yazan sağlayıcıya
   * düşüyor. Varsayılanı açık yapmak, sağlayıcı tanımlamamış bir kurulumda
   * herkesi dışarıda bırakırdı — kodu yalnız sunucu logunu okuyan görebilirdi.
   *
   * `z.coerce.boolean()` bilerek kullanılmadı: o, `"false"` dizesini de `true`
   * sayar. Yani ayarı kapatmak isteyen kişi tam tersini elde ederdi.
   */
  AUTH_OTP_ENABLED: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),

  /** Redis kesintisinde geliştirme/test davranışı; production daima fail-closed. */
  RATE_LIMIT_FAIL_OPEN: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true" || value === "1",
    ),

  REDIS_URL: z
    .string()
    .min(1)
    .optional()
    .refine((v) => v !== undefined || process.env.NODE_ENV !== "production", {
      message:
        "REDIS_URL üretimde zorunlu (H-4): oturum önbelleği ve hız sınırı için.",
    }),
  /** Oturum önbelleği TTL'i, saniye — §17 kararı 5: 60 sn, invalidation'lı. */
  SESSION_CACHE_TTL: z.coerce.number().int().min(0).max(600).default(60),

  /** Mobil access/refresh token ömürleri (§6.1 `mobile-auth`). */
  MOBILE_ACCESS_TTL_MINUTES: z.coerce.number().int().default(15),
  MOBILE_REFRESH_TTL_DAYS: z.coerce.number().int().default(30),

  /** CORS: panel ve sakin portalı aynı origin'den gelir; mobil ayrı. */
  CORS_ORIGINS: z.string().default(""),

  /**
   * Hata izleme — GAP 4.8.1. Boşsa SDK hiç kurulmuyor: yapılandırılmamış bir
   * SDK'yı yine de başlatmak, geliştirmede her hatayı ağa çıkarmaya çalışan
   * bir kuyruk bırakırdı.
   */
  SENTRY_DSN: z.string().url().optional(),
  /** İz örnekleme oranı. Üretimde 1.0 hem pahalı hem gereksiz. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  MIGRATIONS_FOLDER: z.string().default("packages/db/drizzle"),
});

export type Env = z.infer<typeof envSchema> & { isProduction: boolean };

let cached: z.infer<typeof envSchema> | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[api] Ortam değişkenleri geçersiz:\n${issues}`);
  }
  return {
    ...parsed.data,
    isProduction: parsed.data.NODE_ENV === "production",
  };
}

export function env(): Env {
  cached ??= loadEnv();
  return { ...cached, isProduction: cached.NODE_ENV === "production" };
}

export function rateLimitFailOpen(e: Env = env()): boolean {
  if (e.isProduction) return false;
  return e.RATE_LIMIT_FAIL_OPEN !== false;
}

/** Test yardımcısı: doğrulanmış ortamı sıfırlar. */
export function resetEnvCache(): void {
  cached = undefined;
}
