import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Queue } from "bullmq";

import {
  QUEUE_SCHEDULED,
  SCHEDULE_TIMEZONE,
  scheduleEntries,
  type ScheduledJobData,
} from "@yonetim/jobs";

/**
 * Repeatable job kaydı — `vercel.json`'ın yerine (MIMARI-PLAN §10, B1).
 *
 * AÇILIŞTA UZLAŞTIRMA (reconcile), ekleme değil. Redis'teki mevcut tanımlar
 * okunuyor, `packages/jobs`'takiyle karşılaştırılıyor ve **fark** uygulanıyor:
 *
 *   - tanımda olup Redis'te olmayan → eklenir
 *   - cron ifadesi değişmiş        → eskisi silinip yenisi eklenir
 *   - Redis'te olup tanımda olmayan → silinir
 *
 * Son madde önemli: bir job tanımdan çıkarıldığında Redis'teki repeatable
 * kayıt kendiliğinden gitmiyor. Silmezsek, kodda karşılığı olmayan bir iş
 * her gece tetiklenmeye devam eder ve `no_handler` log'u üretir — ya da daha
 * kötüsü, eski bir sürümün davranışını sürdürür.
 *
 * ÇOKLU REPLİKA GÜVENLİ: BullMQ repeatable kaydı `jobId` üzerinden tekil,
 * dolayısıyla iki worker aynı anda açılsa bile ikinci kayıt oluşmuyor.
 * Migration'ın aksine burada advisory lock gerekmiyor — kayıt idempotent.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_SCHEDULED)
    private readonly queue: Queue<ScheduledJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const wanted = scheduleEntries();
    const existing = await this.queue.getRepeatableJobs();

    const wantedByName = new Map(wanted.map((entry) => [entry.name, entry]));
    let added = 0;
    let removed = 0;

    for (const job of existing) {
      const entry = wantedByName.get(job.name);
      // Tanımdan çıkmış ya da cron'u değişmiş: eski kayıt gitmeli.
      if (!entry || entry.cron !== job.pattern) {
        await this.queue.removeRepeatableByKey(job.key);
        removed += 1;
        this.logger.log({
          event: "schedule.removed",
          name: job.name,
          pattern: job.pattern,
          reason: entry ? "cron_changed" : "not_defined",
        });
      }
    }

    const current = new Set(
      (await this.queue.getRepeatableJobs()).map((job) => job.name),
    );

    for (const entry of wanted) {
      if (current.has(entry.name)) continue;
      await this.queue.add(
        entry.name,
        { jobId: entry.definition.id },
        {
          repeat: { pattern: entry.cron, tz: SCHEDULE_TIMEZONE },
          // Geçmiş koşuların gövdesini süresiz saklamak Redis'i şişirir;
          // başarısızları daha uzun tutuyoruz çünkü incelenecek olan onlar.
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 200 },
          attempts: 3,
          backoff: { type: "exponential", delay: 30_000 },
        },
      );
      added += 1;
    }

    this.logger.log({
      event: "schedule.ready",
      defined: wanted.length,
      added,
      removed,
      timezone: SCHEDULE_TIMEZONE,
    });
  }
}
