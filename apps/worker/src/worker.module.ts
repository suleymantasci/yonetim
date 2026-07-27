import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule } from "nestjs-cls";

import { QUEUE_EVENTS, QUEUE_SCHEDULED } from "@yonetim/jobs";
import { LoggerModule } from "nestjs-pino";

import { env } from "@api/infra/config/env";
import { DbModule } from "@api/infra/db/db.module";
import { pinoParams } from "@api/infra/logging/pino.config";

import { JobContext } from "./queue/job-context";
import { EventProcessor } from "./queue/event.processor";
import { JobRegistry } from "./queue/job-registry";
import { ScheduledProcessor } from "./queue/scheduled.processor";
import { SchedulerService } from "./scheduler/scheduler.service";

/**
 * `apps/worker` — zamanlanmış ve kuyruklu işler (MIMARI-PLAN §10, Track B).
 *
 * API'DEN AYRI BİR SÜREÇ, AMA AYNI KOD. Worker api'yi HTTP ile çağırmıyor;
 * `DbModule`'ü ve domain servislerini **doğrudan import ediyor**. Kazanç iç
 * trafiğin sıfırlanması değil asıl olarak: SLA hesabı, gecikme tazminatı ve
 * borç üretimi ekranla worker'da **aynı kod**. HTTP üzerinden çağırsaydık
 * job'ın kendine bir kimlik uydurması ve aynı kuralın iki kez doğrulanması
 * gerekirdi.
 *
 * MIGRATION KOŞMUYOR (§11): şemayı hazır buluyor. Migration'ın tek sahibi
 * `api`; iki servis birden koşarsa advisory lock'a rağmen deploy sırası
 * belirsizleşir.
 *
 * `ClsModule` **middleware'siz**: HTTP isteği yok, bağlamı `JobContext`
 * kuruyor. `DbService` bağlamsız çalışmadığı için (fail-closed) bu zorunlu.
 */
@Module({
  imports: [
    ClsModule.forRoot({ global: true }),
    // `http: false` — worker'ın isteği yok; iz kimliği `JobContext` (ALS)
    // üzerinden geliyor, `genReqId` üzerinden değil.
    LoggerModule.forRootAsync({ useFactory: () => pinoParams({ http: false }) }),
    EventEmitterModule.forRoot({ global: true, wildcard: true, delimiter: "." }),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = env().REDIS_URL;
        if (!url) {
          // Kuyruk olmadan worker'ın yapacağı bir iş yok. Sessizce boşta
          // dönmek yerine açılışta düşmesi doğru: "çalışıyor ama hiçbir job
          // koşmuyor" durumu, fark edilmesi en zor arıza türü.
          throw new Error(
            "[worker] REDIS_URL zorunlu: kuyruk olmadan zamanlanmış iş çalışmaz.",
          );
        }
        return { connection: { url } };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_SCHEDULED }, { name: QUEUE_EVENTS }),
    DbModule,
  ],
  providers: [
    JobContext,
    JobRegistry,
    ScheduledProcessor,
    EventProcessor,
    SchedulerService,
  ],
})
export class WorkerModule {}
