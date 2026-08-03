import type { RedisOptions } from "bullmq";

export function producerRedisConnection(url: string): RedisOptions {
  return {
    url,
    connectTimeout: 1_000,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => (attempt <= 1 ? 100 : null),
  };
}
