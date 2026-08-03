import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

import { env } from "../config/env";

/**
 * Redis — oturum önbelleği (60 sn TTL), hız sınırı sayaçları, BullMQ.
 *
 * `REDIS_URL` yoksa servis **devre dışı** moda geçer: uygulama çalışmaya devam
 * eder, yalnızca her istekte oturum veritabanından çözülür. Geliştirme
 * kurulumunu Redis'e bağımlı yapmamak bilinçli; üretimde compose zaten veriyor.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private warned = false;
  private connectionErrorLogged = false;

  private conn(): Redis | null {
    const url = env().REDIS_URL;
    if (!url) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          "REDIS_URL tanımlı değil; oturum önbelleği ve hız sınırı devre dışı.",
        );
      }
      return null;
    }

    if (this.client) return this.client;

    const client = new Redis(url, {
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => (attempt <= 1 ? 100 : null),
      lazyConnect: false,
    });
    client.on("error", (error) => {
      if (this.connectionErrorLogged) return;
      this.connectionErrorLogged = true;
      this.logger.warn({
        event: "redis.connection_failed",
        error: String(error),
      });
    });
    client.on("ready", () => {
      this.connectionErrorLogged = false;
    });
    client.on("end", () => {
      if (this.client === client) this.client = null;
    });
    this.client = client;
    return client;
  }

  /** Ham istemci — BullMQ ve kuyruk modülleri için. */
  raw(): Redis | null {
    return this.conn();
  }

  async get(key: string): Promise<string | null> {
    const c = this.conn();
    if (!c) return null;
    try {
      return await c.get(key);
    } catch (error) {
      // Önbellek kritik yol değil: hata halinde kaynağa düşülür.
      this.logger.warn({
        event: "redis.get_failed",
        key,
        error: String(error),
      });
      return null;
    }
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    const c = this.conn();
    if (!c || ttlSeconds <= 0) return;
    try {
      await c.set(key, value, "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn({
        event: "redis.set_failed",
        key,
        error: String(error),
      });
    }
  }

  async del(...keys: string[]): Promise<void> {
    const c = this.conn();
    if (!c || keys.length === 0) return;
    try {
      await c.del(...keys);
    } catch (error) {
      this.logger.warn({ event: "redis.del_failed", error: String(error) });
    }
  }

  /** Sabit pencereli sayaç — hız sınırı. Redis yoksa her zaman izin verir. */
  async incrWindow(key: string, windowSeconds: number): Promise<number | null> {
    const c = this.conn();
    if (!c) return null;
    try {
      const count = await c.incr(key);
      if (count === 1) await c.expire(key, windowSeconds);
      return count;
    } catch (error) {
      this.logger.warn({
        event: "redis.incr_failed",
        key,
        error: String(error),
      });
      return null;
    }
  }

  async ping(): Promise<boolean> {
    const c = this.conn();
    if (!c) return false;
    try {
      return (await c.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
    this.client = null;
  }
}
