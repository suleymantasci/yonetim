import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RateLimitGuard } from "../apps/api/src/identity/guards/rate-limit.guard";
import { resetEnvCache } from "../apps/api/src/infra/config/env";

function makeExecutionContext() {
  const response = { setHeader: vi.fn() };
  const request = { ip: "127.0.0.1" };
  const http = {
    getRequest: vi.fn(() => request),
    getResponse: vi.fn(() => response),
  };
  const exec = {
    getHandler: vi.fn(() => "handler"),
    getClass: vi.fn(() => "class"),
    switchToHttp: vi.fn(() => http),
  };
  return { exec: exec as never, response };
}

function makeGuard() {
  const redis = { incrWindow: vi.fn().mockResolvedValue(null) };
  const cls = { get: vi.fn(() => undefined) };
  const reflector = { getAllAndOverride: vi.fn() };
  const guard = new RateLimitGuard(
    redis as never,
    cls as never,
    reflector as never,
  );
  return { guard, redis, cls, reflector };
}

describe("RateLimitGuard Redis yokluğu politikası", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/d";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.FIELD_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.REDIS_URL = "redis://127.0.0.1:6379";
    delete process.env.RATE_LIMIT_FAIL_OPEN;
    resetEnvCache();
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.RATE_LIMIT_FAIL_OPEN;
    resetEnvCache();
  });

  it("SkipRateLimit handler Redis'e dokunmadan geçer", async () => {
    const { guard, redis, reflector } = makeGuard();
    const { exec } = makeExecutionContext();
    reflector.getAllAndOverride.mockReturnValueOnce(true);

    await expect(guard.canActivate(exec)).resolves.toBe(true);
    expect(redis.incrWindow).not.toHaveBeenCalled();
  });

  it("development ortamında Redis yokluğu isteği düşürmez", async () => {
    const { guard, redis, reflector } = makeGuard();
    const { exec } = makeExecutionContext();
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(guard.canActivate(exec)).resolves.toBe(true);
    expect(redis.incrWindow).toHaveBeenCalledWith("rl:public:127.0.0.1", 60);
  });

  it("production ortamında Redis yokluğu 503 ve Retry-After üretir", async () => {
    process.env.NODE_ENV = "production";
    resetEnvCache();
    const { guard, reflector } = makeGuard();
    const { exec, response } = makeExecutionContext();
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const error = await guard
      .canActivate(exec)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ message: "rate_limiter_unavailable" });
    expect((error as { getStatus: () => number }).getStatus()).toBe(503);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "60");
  });
});
