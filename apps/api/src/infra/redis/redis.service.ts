import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
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
export class RedisService implements OnModuleInit, OnModuleDestroy {
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

  /**
   * Bağlantı hazır olana kadar (en çok `connectTimeout` kadar) bekler.
   *
   * `enableOfflineQueue: false` iken bağlantı kurulmadan gönderilen komut
   * anında "Stream isn't writeable" ile düşüyor. İstemci ilk ihtiyaç anında
   * oluşturulduğu için her açılıştan (ve her yeniden bağlanmadan) sonraki
   * **ilk** komut kayboluyordu; üretimde bu, deploy sonrası ilk girişin hız
   * sınırlayıcıdan 503 almasıydı. Kısa bekleme kuyruksuz davranışı koruyor:
   * Redis gerçekten yoksa yine ~1 sn içinde `null`/hata yoluna düşülüyor.
   */
  private async ready(): Promise<Redis | null> {
    const c = this.conn();
    if (!c || c.status === "ready") return c;
    if (c.status === "end" || c.status === "close") return c;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        c.off("ready", done);
        c.off("end", done);
        resolve();
      };
      const timer = setTimeout(done, 1_000);
      c.once("ready", done);
      c.once("end", done);
    });
    return c;
  }

  /** Açılışta bağlantıyı kur — ilk isteği beklemesin. */
  onModuleInit(): void {
    this.conn();
  }

  /** Ham istemci, bağlantı hazır olduktan sonra — doğrudan komut gönderecekler için. */
  async rawReady(): Promise<Redis | null> {
    return this.ready();
  }

  /** Ham istemci — BullMQ ve kuyruk modülleri için. */
  raw(): Redis | null {
    return this.conn();
  }

  async get(key: string): Promise<string | null> {
    const c = await this.ready();
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
    const c = await this.ready();
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
    const c = await this.ready();
    if (!c || keys.length === 0) return;
    try {
      await c.del(...keys);
    } catch (error) {
      this.logger.warn({ event: "redis.del_failed", error: String(error) });
    }
  }

  /** Sabit pencereli sayaç — hız sınırı. Redis yoksa her zaman izin verir. */
  async incrWindow(key: string, windowSeconds: number): Promise<number | null> {
    const c = await this.ready();
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
    const c = await this.ready();
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
