/**
 * Sunucu tarafı ortam değişkenleri — tek okuma noktası.
 * Eksik değer build'i patlatmaz; ilgili entegrasyon "disabled" moda düşer
 * (SPEC Bölüm 22: entegrasyonlar aşamalı açılır).
 */
function optional(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

function required(key: string, fallback?: string): string {
  const v = optional(key) ?? fallback;
  if (!v) {
    throw new Error(
      `[config] Zorunlu ortam değişkeni eksik: ${key}. .env.example dosyasına bakın.`,
    );
  }
  return v;
}

export const serverEnv = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",

  databaseUrl: () => required("DATABASE_URL"),
  redisUrl: () => optional("UPSTASH_REDIS_REST_URL"),
  redisToken: () => optional("UPSTASH_REDIS_REST_TOKEN"),

  authSecret: () =>
    required("AUTH_SECRET", "dev-only-insecure-secret-change-me"),

  /*
   * `encryptionKey` BİLEREK YOK — MIMARI-PLAN §14 A3.
   *
   * Alan bazlı şifreleme anahtarı (`FIELD_ENCRYPTION_KEY`, SPEC 5.6) yalnız
   * `apps/api` tarafından okunuyor: `apps/api/src/infra/config/env.ts` onu
   * zorunlu kılıyor, `PiiService` tek tüketicisi. Buradan bir erişimci
   * sunmak, anahtarı `apps/app` dahil bu paketi kuran **her** sürece açardı.
   *
   * TCKN/IBAN çözmenin tek yeri olması bir konvansiyon değil, dağıtım
   * kısıtı: `app` konteynerine bu değişken hiç verilmiyor (§8.3, docker
   * compose'daki yorumlu satır).
   */

  iyzico: () => ({
    apiKey: optional("IYZICO_API_KEY"),
    secretKey: optional("IYZICO_SECRET_KEY"),
    baseUrl: optional("IYZICO_BASE_URL") ?? "https://sandbox-api.iyzipay.com",
  }),
  paytr: () => ({
    merchantId: optional("PAYTR_MERCHANT_ID"),
    merchantKey: optional("PAYTR_MERCHANT_KEY"),
    merchantSalt: optional("PAYTR_MERCHANT_SALT"),
  }),
  whatsapp: () => ({
    phoneNumberId: optional("WHATSAPP_PHONE_NUMBER_ID"),
    accessToken: optional("WHATSAPP_ACCESS_TOKEN"),
    verifyToken: optional("WHATSAPP_VERIFY_TOKEN"),
    appSecret: optional("WHATSAPP_APP_SECRET"),
    apiVersion: optional("WHATSAPP_API_VERSION") ?? "v21.0",
  }),
  netgsm: () => ({
    userCode: optional("NETGSM_USERCODE"),
    password: optional("NETGSM_PASSWORD"),
    msgHeader: optional("NETGSM_MSGHEADER"),
  }),
  iletimerkezi: () => ({
    key: optional("ILETIMERKEZI_KEY"),
    hash: optional("ILETIMERKEZI_HASH"),
    sender: optional("ILETIMERKEZI_SENDER"),
  }),
  resend: () => ({
    apiKey: optional("RESEND_API_KEY"),
    from: optional("RESEND_FROM"),
  }),
  paramBanking: () => ({
    clientId: optional("PARAM_CLIENT_ID"),
    clientSecret: optional("PARAM_CLIENT_SECRET"),
    baseUrl: optional("PARAM_BASE_URL"),
  }),
  storage: () => ({
    accountId: optional("R2_ACCOUNT_ID"),
    accessKeyId: optional("R2_ACCESS_KEY_ID"),
    secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
    bucket: optional("R2_BUCKET"),
    publicUrl: optional("R2_PUBLIC_URL"),
  }),
  ai: () => ({
    anthropicKey: optional("ANTHROPIC_API_KEY"),
    openaiKey: optional("OPENAI_API_KEY"),
  }),
} as const;

export function isConfigured(values: Record<string, unknown>): boolean {
  return Object.values(values).every((v) => v !== undefined && v !== "");
}
