import { Injectable, Logger } from "@nestjs/common";
import { and, inArray, isNull } from "drizzle-orm";

import { tenants } from "@yonetim/db";
import {
  applyLateFees,
  collectMaintenanceReminders,
  generateDuesForTenant,
} from "@yonetim/jobs";

import { DbService } from "@api/infra/db/db.service";

import { JobContext } from "./job-context";

export interface JobOutcome {
  tenantId: string;
  /** İşin gerçekten bir şey yapıp yapmadığı — log'da ayırt edilebilsin. */
  status: "ok" | "skipped" | "failed";
  detail?: unknown;
}

export interface JobRunSummary {
  jobId: string;
  tenants: number;
  ok: number;
  skipped: number;
  failed: number;
  outcomes: JobOutcome[];
}

/**
 * Job kimliği → gerçek iş — MIMARI-PLAN §10.
 *
 * ÇALIŞTIRMA MODELİ: her job **tenant tenant** koşuyor ve her tenant kendi
 * `RequestContext`'i içinde. Tek bir baypas transaction'ında hepsini
 * dolaşmak daha hızlı olurdu ama RLS'i kapatırdı; hız, tenant sınırının
 * bedeli olarak ödenecek bir şey değil.
 *
 * HATA İZOLASYONU tenant düzeyinde: bir sitenin verisi bozuksa o site
 * `failed` olur, diğerleri koşmaya devam eder. Tersi, tek bozuk kaydın o
 * gece hiçbir sitede aidat üretilmemesine yol açması demekti.
 *
 * TANIMLI AMA HENÜZ YAZILMAMIŞ İŞLER `skipped: no_handler` döndürüyor,
 * sessizce başarılı sayılmıyor. `packages/jobs` 19 iş tanımlıyor; bunların
 * bir kısmının gövdesi Track E'de yazılacak. Tanımı silmek yerine görünür
 * bırakmak, "bu iş neden hiç çalışmıyor" sorusunu log'dan cevaplanabilir
 * kılıyor.
 */
@Injectable()
export class JobRegistry {
  private readonly logger = new Logger(JobRegistry.name);

  constructor(
    private readonly db: DbService,
    private readonly context: JobContext,
  ) {}

  async run(jobId: string, only?: string): Promise<JobRunSummary> {
    const targets = only ? [only] : await this.activeTenantIds();
    const outcomes: JobOutcome[] = [];

    for (const tenantId of targets) {
      try {
        const detail = await this.context.run({ tenantId, jobId }, () =>
          this.runFor(jobId, tenantId),
        );
        outcomes.push(
          detail === NO_HANDLER
            ? { tenantId, status: "skipped", detail: "no_handler" }
            : { tenantId, status: "ok", detail },
        );
      } catch (error) {
        this.logger.error({
          event: "job.tenant_failed",
          jobId,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        outcomes.push({
          tenantId,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      jobId,
      tenants: targets.length,
      ok: outcomes.filter((o) => o.status === "ok").length,
      skipped: outcomes.filter((o) => o.status === "skipped").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      outcomes,
    };
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
        return NO_HANDLER;
    }
  }

  /**
   * Askıya alınmış ve silinmiş siteler atlanıyor.
   *
   * `past_due` **dahil**: ödemesi geciken bir sitede aidat üretmeyi durdurmak,
   * borcu bizim tarafımızdan silmek olurdu. Erişim kısıtlaması ayrı bir karar
   * (§tenant durumu), veri üretimi ayrı.
   */
  private activeTenantIds(): Promise<string[]> {
    return this.db
      .bypass("job:tenants", async (tx) =>
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

/** Gövdesi henüz yazılmamış iş — `skipped` olarak raporlanır. */
const NO_HANDLER = Symbol("no_handler");
