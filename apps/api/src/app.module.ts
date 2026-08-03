import { randomUUID } from "node:crypto";

import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import type { Request } from "express";

import { QUEUE_EVENTS, QUEUE_SCHEDULED } from "@yonetim/jobs";
import { ClsModule } from "nestjs-cls";
import { LoggerModule } from "nestjs-pino";

import { FinanceModule } from "./finance/finance.module";
import { AuditModule } from "./governance/audit/audit.module";
import { IdentityModule } from "./identity/identity.module";
import { InsightModule } from "./insight/insight.module";
import { CommunicationModule } from "./communication/communication.module";
import { IntegrationModule } from "./integration/integration.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { OperationsModule } from "./operations/operations.module";
import { PermissionGuard } from "./identity/guards/permission.guard";
import { RateLimitGuard } from "./identity/guards/rate-limit.guard";
import { TenantContextGuard } from "./identity/guards/tenant-context.guard";
import { TenantWritableGuard } from "./identity/guards/tenant-writable.guard";
import { DbModule } from "./infra/db/db.module";
import { HealthController } from "./infra/health/health.controller";
import { ApiExceptionFilter } from "./infra/logging/api-exception.filter";
import { pinoParams } from "./infra/logging/pino.config";
import { RedisModule } from "./infra/redis/redis.module";
import { DomainEventsBridge } from "./infra/events/domain-events.service";
import { JobTriggerController } from "./infra/scheduler/job-trigger.controller";
import { env } from "./infra/config/env";
import { producerRedisConnection } from "./infra/redis/redis-connection";
import { PropertyModule } from "./property/property.module";
import { PublicModule } from "./public/public.module";

/**
 * Kök modül — MIMARI-PLAN §5.
 *
 * Guard sırası bilinçli ve **global**: her uç varsayılan olarak korumalı.
 * `@Public()` istisnayı açıkça bildirir. Tersini yapmak (opt-in koruma)
 * unutulan bir dekoratörü sessiz bir güvenlik açığına çevirirdi.
 *
 *   1. `TenantContextGuard`  → kimlik çözülür, ALS'e yazılır
 *   2. `RateLimitGuard`      → kimliğe bağlı sayaç
 *   3. `PermissionGuard`     → `@RequirePermission` kontrolü
 *   4. `TenantWritableGuard` → pasif/arşiv sitede yazma reddedilir
 *
 * Dördüncü guard en sonda: "yetkin var ama site pasif" mesajı, "yetkin yok"
 * mesajının yerini almamalı. Yetki kararı önce verilir, yaşam döngüsü kararı
 * onun üstüne biner.
 */
@Module({
  imports: [
    // ALS: `RequestContext` istek boyunca her katmanda erişilebilir olsun.
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req: Request) =>
          (typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : null) ?? randomUUID(),
      },
    }),
    // `forRootAsync`: ortam doğrulaması modül **yüklenirken** değil, uygulama
    // kurulurken koşsun — hata mesajı Nest'in hata yoluna düşsün.
    LoggerModule.forRootAsync({ useFactory: () => pinoParams() }),
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true,
      delimiter: ".",
    }),
    /**
     * Kuyruk — api yalnız **üretici** (§10). İşleri `apps/worker` tüketiyor.
     *
     * `REDIS_URL` yoksa kuyruk kurulmuyor ve elle tetikleme ucu 500 veriyor;
     * api'nin tamamını Redis'e bağımlı yapmak, geliştirme kurulumunu gereksiz
     * yere ağırlaştırırdı. Worker'da ise aynı eksiklik açılışta hata —
     * kuyruğu olmayan bir worker'ın yapacağı iş yok.
     */
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: producerRedisConnection(
          env().REDIS_URL ?? "redis://127.0.0.1:6379",
        ),
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_SCHEDULED }, { name: QUEUE_EVENTS }),
    RedisModule,
    DbModule,
    AuditModule,
    IdentityModule,

    // Bağlam modülleri (§6). Sıra önemsiz; her biri kendi yüzeyini kaydediyor.
    PropertyModule,
    FinanceModule,
    InsightModule,
    OperationsModule,
    CommunicationModule,
    TenancyModule,
    IntegrationModule,

    // Dış sözleşme (§9.1) — bağlam değil, istemci ayrımı.
    PublicModule,
  ],
  controllers: [HealthController, JobTriggerController],
  providers: [
    DomainEventsBridge,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: TenantWritableGuard },
  ],
})
export class AppModule {}
