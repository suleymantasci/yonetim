import { Controller, Get } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { sql } from "drizzle-orm";

import { getDb } from "@yonetim/db";

import { Public, SkipRateLimit } from "../../identity/decorators";
import { RedisService } from "../redis/redis.service";

/**
 * Sağlık probları — MIMARI-PLAN §11 / §16 "iki servis, iki deploy".
 *
 * İkisi ayrı olmalı:
 *  - `/health` **liveness**: process ayakta mı? Bağımlılıklara bakmaz, yoksa
 *    Postgres bir saniye takıldığında orchestrator container'ı yeniden başlatır.
 *  - `/health/ready` **readiness**: bağımlılıklar hazır mı? `worker` bu probu
 *    bekliyor (migration'ı yalnız `api` çalıştırdığı için — §11).
 *
 * NOT (§8.3 değişmez 1): `getDb()` normalde yalnız `db.service.ts`'de çağrılır.
 * Burası tek istisna ve bilinçli — sağlık probunun tenant bağlamı yok, RLS
 * transaction'ı açmadan salt `SELECT 1` atıyor. `dependency-cruiser` kuralı
 * bu dosyayı adıyla muaf tutuyor (§15).
 */
@Controller("health")
export class HealthController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  @Public()
  @SkipRateLimit()
  @ApiExcludeEndpoint()
  live() {
    return { status: "ok", uptime: Math.round(process.uptime()) };
  }

  @Get("ready")
  @Public()
  @SkipRateLimit()
  @ApiExcludeEndpoint()
  async ready() {
    const [db, redis] = await Promise.all([this.checkDb(), this.redis.ping()]);
    const status = readinessStatus(db, redis);
    return { status, checks: { database: db, redis } };
  }

  private async checkDb(): Promise<boolean> {
    try {
      await getDb().execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}

export function readinessStatus(
  database: boolean,
  redis: boolean,
): "ok" | "degraded" {
  return database && redis ? "ok" : "degraded";
}
