import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { QUEUE_DEMO, type DemoJobData } from "@yonetim/jobs";

import { DemoLifecycleService } from "@api/tenancy/demo/demo-lifecycle.service";

/**
 * Demo hesabı kurulumu — onay bağlantısı tıklanınca kuyruğa düşen iş.
 *
 * Eşzamanlılık 2: kurulum birkaç saniye sürüyor ve tek transaction; aynı
 * anda çok sayıda onay gelirse veritabanını boğmadan sırayla işleniyor.
 * Tekrar deneme kuyrukta değil talepte: başarısız kurulum `failed` olur,
 * kişi bağlantıdan yeniden dener (en çok 3 kez).
 */
@Processor(QUEUE_DEMO, { concurrency: 2 })
export class DemoProcessor extends WorkerHost {
  private readonly logger = new Logger("DemoJob");

  constructor(private readonly lifecycle: DemoLifecycleService) {
    super();
  }

  override async process(job: Job<DemoJobData>): Promise<unknown> {
    const started = Date.now();
    const result = await this.lifecycle.provision(job.data.requestId);
    this.logger.log({ event: "demo.job_finished", requestId: job.data.requestId, result, durationMs: Date.now() - started });
    return { result };
  }
}
