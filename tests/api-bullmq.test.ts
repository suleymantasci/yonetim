import { describe, expect, it } from "vitest";

import { producerRedisConnection } from "../apps/api/src/infra/redis/redis-connection";

describe("API BullMQ producer Redis bağlantısı", () => {
  it("Redis yokken komutları hızlı reddedecek şekilde yapılandırılır", () => {
    const options = producerRedisConnection("redis://127.0.0.1:6399");

    expect(options).toMatchObject({
      url: "redis://127.0.0.1:6399",
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    expect(options.retryStrategy(1)).toBe(100);
    expect(options.retryStrategy(2)).toBeNull();
  });
});
