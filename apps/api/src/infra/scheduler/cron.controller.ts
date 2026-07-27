import { timingSafeEqual } from "node:crypto";

import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { and, inArray, isNull } from "drizzle-orm";

import {
  applyLateFees,
  collectMaintenanceReminders,
  generateDuesForTenant,
  jobBySlug,
} from "@yonetim/jobs";
import { tenants } from "@yonetim/db";

import { Public } from "../../identity/decorators";
import { env } from "../config/env";
import { DbService } from "../db/db.service";

/**
 * Zamanlanmış işler — `POST /internal/cron/:job` (SPEC Bölüm 20).
 *
 * NEDEN `apps/api`'DE: iş gövdeleri (`@yonetim/jobs`) veritabanına yazıyor.
 * Uç Next'te kalsaydı render katmanı `@yonetim/db`'yi dolaylı olarak içeri
 * almaya devam ederdi — MIMARI-PLAN §8.3 değişmez 3 tam da bunu yasaklıyor.
 *
 * KİMLİK: `CRON_SECRET`. Guard zincirinden `@Public()` ile çıkıyor çünkü bu
 * çağrının kullanıcısı ve tenant'ı yok: iş **tüm** tenant'ları dolaşıyor.
 * Sır tanımlı değilse uç 401 döner — sırsız bir cron ucu, herkese açık bir
 * cron ucudur.
 *
 * Track B'de bu uç kuyruğa iş atan bir tetikleyiciye dönüşecek; bugün işi
 * senkron çalıştırıyor. Değişecek olan **arkası**, adresi değil.
 */
@ApiExcludeController()
@Controller("internal/cron")
export class CronController {
  private readonly logger = new Logger("Cron");

  constructor(private readonly db: DbService) {}

  @Post(":job")
  @Public()
  @HttpCode(200)
  async run(
    @Param("job") job: string,
    @Headers("authorization") authorization?: string,
  ) {
    this.assertAuthorized(authorization);

    const definition = jobBySlug(job);
    if (!definition) throw new NotFoundException(`unknown_job:${job}`);

    const tenantIds = await this.activeTenantIds();
    const results: unknown[] = [];

    for (const tenantId of tenantIds) {
      // Bir sitenin işi patlarsa diğerleri çalışmaya devam etmeli: aksi halde
      // tek bozuk veri, o gece hiçbir sitede aidat üretilmemesine yol açardı.
      try {
        results.push(await this.runFor(definition.id, tenantId));
      } catch (error) {
        this.logger.error({
          event: "cron.tenant_failed",
          job: definition.id,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        results.push({ tenantId, failed: true });
      }
    }

    return { job: definition.id, tenants: tenantIds.length, results };
  }

  private async runFor(jobId: string, tenantId: string): Promise<unknown> {
    switch (jobId) {
      case "dues.generate-monthly":
        return generateDuesForTenant({ tenantId });
      case "dues.late-fee":
        return applyLateFees({ tenantId });
      case "maintenance.reminders":
        return collectMaintenanceReminders({ tenantId });
      default:
        return { tenantId, skipped: "no_handler", job: jobId };
    }
  }

  /**
   * Sır karşılaştırması sabit zamanlı: uzunluk farkından ya da erken
   * çıkıştan sızan zamanlama bilgisi, sırrı bayt bayt tahmin edilebilir kılar.
   */
  private assertAuthorized(header: string | undefined): void {
    const secret = env().CRON_SECRET;
    if (!secret) throw new UnauthorizedException("cron_disabled");

    const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException();
    }
  }

  /** Askıya alınmış ve silinmiş siteler için iş çalıştırılmaz. */
  private activeTenantIds(): Promise<string[]> {
    return this.db
      .bypass("cron:tenants", async (tx) =>
        tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(
            and(
              inArray(tenants.status, ["trial", "active", "past_due"]),
              isNull(tenants.deletedAt),
            ),
          ),
      )
      .then((rows) => rows.map((row) => row.id));
  }
}
