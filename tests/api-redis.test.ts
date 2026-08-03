import { beforeEach, describe, expect, it } from "vitest";

import { RedisService } from "../apps/api/src/infra/redis/redis.service";
import { resetEnvCache } from "../apps/api/src/infra/config/env";

describe("RedisService bağlantı dayanıklılığı", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/d";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.FIELD_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.REDIS_URL = "redis://127.0.0.1:6399";
    resetEnvCache();
  });

  it("erişilemeyen Redis için fast-fail seçenekleri ve error listener kurar", async () => {
    const service = new RedisService();
    const client = service.raw();
    expect(client).not.toBeNull();

    const errorListeners = client!.listenerCount("error");
    client!.on("error", () => undefined);
    expect(errorListeners).toBeGreaterThan(0);
    expect(client!.options.enableOfflineQueue).toBe(false);
    expect(client!.options.connectTimeout).toBeLessThanOrEqual(1_000);
    expect(client!.options.maxRetriesPerRequest).toBe(1);

    const started = performance.now();
    await expect(service.incrWindow("probe", 60)).resolves.toBeNull();
    expect(performance.now() - started).toBeLessThan(2_000);
    await service.onModuleDestroy();
  });

  it("başarısız bağlantı sonlandırılırken destroy güvenlidir", async () => {
    const service = new RedisService();
    service.raw()?.on("error", () => undefined);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
