import { afterEach, describe, expect, it } from "vitest";

/**
 * C-7 / C-8 / L-1 / L-2 (SECURITY-REVIEW.md): Ortam değişkeni doğrulaması
 * zayıf default değerleri ve bilinen geliştirme sırlarını reddetmeli.
 * Üretimde `AUTH_SECRET` 32+ byte olmalı ve "dev-only-..." default'u ile
 * başlamamalı. `FIELD_ENCRYPTION_KEY` all-zero veya düşük entropili
 * olamaz.
 */
describe("apps/api env zod security guard", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  const baseValid: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    DATABASE_URL: "postgres://u:p@h:5432/d",
    AUTH_SECRET: "a".repeat(32),
    FIELD_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    REDIS_URL: "redis://localhost:6379",
    SESSION_CACHE_TTL: "60",
  };

  async function loadApi(source: Record<string, string>) {
    const mod = await import("../apps/api/src/infra/config/env");
    return mod.loadEnv(source as never);
  }

  it("AUTH_SECRET 8 karakterlik kısa değer kabul edilmez", async () => {
    await expect(
      loadApi({ ...baseValid, AUTH_SECRET: "short" }),
    ).rejects.toThrow(/AUTH_SECRET/);
  });

  it("AUTH_SECRET bilinen geliştirme varsayılanı reddedilir", async () => {
    await expect(
      loadApi({
        ...baseValid,
        AUTH_SECRET: "dev-only-insecure-secret-change-me",
      }),
    ).rejects.toThrow(/AUTH_SECRET/);
  });

  it("AUTH_SECRET 32+ byte farklı değer kabul edilir", async () => {
    const env = await loadApi({
      ...baseValid,
      AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      FIELD_ENCRYPTION_KEY:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    expect(env.AUTH_SECRET).toBe("abcdefghijklmnopqrstuvwxyz012345");
  });

  it("FIELD_ENCRYPTION_KEY all-zero reddedilir", async () => {
    await expect(
      loadApi({ ...baseValid, FIELD_ENCRYPTION_KEY: "0".repeat(64) }),
    ).rejects.toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it("FIELD_ENCRYPTION_KEY düşük entropi reddedilir", async () => {
    await expect(
      loadApi({ ...baseValid, FIELD_ENCRYPTION_KEY: "a".repeat(64) }),
    ).rejects.toThrow(/FIELD_ENCRYPTION_KEY/);
  });

  it("FIELD_ENCRYPTION_KEY 16+ unique karakter kabul edilir", async () => {
    const ok =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    expect(ok.length).toBe(64);
    expect(new Set(ok.toLowerCase()).size).toBeGreaterThanOrEqual(16);
    const env = await loadApi({ ...baseValid, FIELD_ENCRYPTION_KEY: ok });
    expect(env.FIELD_ENCRYPTION_KEY).toBe(ok);
  });

  it("RATE_LIMIT_FAIL_OPEN development ortamında belirtilmeden kalabilir", async () => {
    const env = await loadApi({
      ...baseValid,
      NODE_ENV: "development",
      RATE_LIMIT_FAIL_OPEN: undefined as never,
    });
    expect(env.RATE_LIMIT_FAIL_OPEN).toBeUndefined();
  });

  it("RATE_LIMIT_FAIL_OPEN false ve 0 değerlerini kapatır", async () => {
    const falseEnv = await loadApi({
      ...baseValid,
      NODE_ENV: "development",
      RATE_LIMIT_FAIL_OPEN: "false",
    });
    const zeroEnv = await loadApi({
      ...baseValid,
      NODE_ENV: "development",
      RATE_LIMIT_FAIL_OPEN: "0",
    });
    expect(falseEnv.RATE_LIMIT_FAIL_OPEN).toBe(false);
    expect(zeroEnv.RATE_LIMIT_FAIL_OPEN).toBe(false);
  });

  it("RATE_LIMIT_FAIL_OPEN true ve 1 değerlerini açar", async () => {
    const trueEnv = await loadApi({
      ...baseValid,
      NODE_ENV: "development",
      RATE_LIMIT_FAIL_OPEN: "true",
    });
    const oneEnv = await loadApi({
      ...baseValid,
      NODE_ENV: "development",
      RATE_LIMIT_FAIL_OPEN: "1",
    });
    expect(trueEnv.RATE_LIMIT_FAIL_OPEN).toBe(true);
    expect(oneEnv.RATE_LIMIT_FAIL_OPEN).toBe(true);
  });
});
