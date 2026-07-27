import { InjectQueue } from "@nestjs/bullmq";
import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Queue } from "bullmq";

import { assertPlatformAdmin } from "@yonetim/auth/guard";
import type { Role } from "@yonetim/core";
import {
  JOBS,
  jobBySlug,
  QUEUE_SCHEDULED,
  type JobDefinition,
  type ScheduledJobData,
} from "@yonetim/jobs";

import { DbService } from "../db/db.service";

/**
 * Zamanlanmış işi **elle** tetikleme — `/v1/panel/platform/jobs/:job/run`.
 *
 * NEDEN `CRON_SECRET` DEĞİL: zamanlamanın sahibi artık `apps/worker` (B1);
 * işler Redis'teki repeatable tanımlardan kendiliğinden koşuyor. Geriye kalan
 * ihtiyaç "dün gece patlayan işi yeniden koştur" ve bu bir **insan** eylemi.
 * Paylaşılan bir sır dağıtmak yerine platform yöneticisi kimliğiyle
 * yetkilendiriliyor: "kim tetikledi" sorusunun cevabı böylece kayıtta duruyor.
 * Sır dosyadan da düştü — dağıtılmayan sır sızmaz.
 *
 * API kuyruğa **yazıyor**, işi çalıştırmıyor. Bir HTTP isteğinin arkasında
 * 15 dakikalık borç üretimi koşturmak, isteğin zaman aşımına uğradığı yerde
 * işin yarıda kalmasına yol açardı — kuyruğun var olma nedeni tam olarak bu.
 */
@ApiExcludeController()
@Controller("v1/panel/platform/jobs")
export class JobTriggerController {
  constructor(
    private readonly db: DbService,
    @InjectQueue(QUEUE_SCHEDULED)
    private readonly queue: Queue<ScheduledJobData>,
  ) {}

  @Post(":job/run")
  @HttpCode(202)
  async trigger(
    @Param("job") job: string,
    @Query("tenantId") tenantId?: string,
  ) {
    const ctx = this.db.ctx();
    assertPlatformAdmin(ctx.roles as Role[]);

    // Hem slug (`dues-late-fee`) hem tam kimlik (`dues.late-fee`) kabul
    // ediliyor: ilki eski cron adreslerinden, ikincisi log çıktılarından
    // kopyalanıyor ve ikisi de elle yazılacak yerler.
    const definition = jobBySlug(job) ?? byId(job);
    if (!definition) throw new NotFoundException(`unknown_job:${job}`);

    const enqueued = await this.queue.add(
      definition.id,
      { jobId: definition.id, tenantId, triggeredBy: ctx.userId },
      {
        // Elle tetiklenen koşu yeniden denenmiyor: bir insan bekliyor ve
        // sonucu görüp kendisi tekrar tetikleyebilir. Otomatik yeniden deneme
        // "çalıştı mı" sorusunu bulanıklaştırırdı.
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    );

    // 202: iş kuyruğa alındı, **bitmedi**. 200 dönmek tamamlandı demek olurdu.
    return { queued: true, jobId: definition.id, queueJobId: enqueued.id };
  }
}

const BY_ID = new Map<string, JobDefinition>(
  JOBS.map((definition) => [definition.id, definition]),
);

function byId(value: string): JobDefinition | null {
  return BY_ID.get(value) ?? null;
}
