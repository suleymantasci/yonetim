import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { JobRegistry, type JobRunSummary } from "./job-registry";
import { QUEUE_SCHEDULED, type ScheduledJobData } from "@yonetim/jobs";

/**
 * Zamanlanmış iş tüketicisi — MIMARI-PLAN §10.
 *
 * EŞZAMANLILIK 1: aynı anda tek job koşuyor. `packages/jobs` tanımlarının
 * çoğu `singleton: true` ve olmayanlar da aynı tabloya yazıyor; paralel
 * koşmak, aidat üretimini iki kez tetikleyebilecek bir yarış açardı.
 * Ölçeklenmesi gereken şey job sayısı değil, job **içindeki** iş — o da
 * tenant döngüsünde yapılıyor.
 *
 * HATA POLİTİKASI: job **atmıyor**, özet döndürüyor. Tenant düzeyinde hata
 * `JobRegistry` içinde yakalanıp `failed` olarak raporlanıyor; job'ın
 * tamamını başarısız saymak, bir sitenin bozuk verisi yüzünden diğer 200
 * siteyi yeniden çalıştırmak demekti. Gerçekten job'ın kendisi patlarsa
 * (Redis, DB erişimi) BullMQ'nun yeniden deneme politikası devreye giriyor.
 */
@Processor(QUEUE_SCHEDULED, { concurrency: 1 })
export class ScheduledProcessor extends WorkerHost {
  private readonly logger = new Logger("ScheduledJob");

  constructor(private readonly registry: JobRegistry) {
    super();
  }

  override async process(job: Job<ScheduledJobData>): Promise<JobRunSummary> {
    const jobId = job.data.jobId;
    const started = Date.now();

    const summary = await this.registry.run(jobId, job.data.tenantId);

    this.logger.log({
      event: "job.finished",
      jobId,
      durationMs: Date.now() - started,
      tenants: summary.tenants,
      ok: summary.ok,
      skipped: summary.skipped,
      failed: summary.failed,
    });

    return summary;
  }
}
