import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { tenants } from "@yonetim/db";
import {
  applyLateFees,
  collectMaintenanceReminders,
  documentExpiry,
  duesLateWarning,
  duesReminder,
  expireTrial,
  generateDuesForTenant,
  kvkkRequestSla,
  kvkkRetentionScan,
  meetingReminders,
  purgeExpiredArchive,
  renewSubscription,
  runDunning,
  slaBreachCheck,
} from "@yonetim/jobs";

import { DbService } from "@api/infra/db/db.service";
import { captureException } from "@api/infra/observability/capture";

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
 * sessizce başarılı sayılmıyor. `packages/jobs` 20 iş tanımlıyor; bunların
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
    const targets = await this.writableTenants(only, JOB_TENANT_STATUSES[jobId]);
    const outcomes: JobOutcome[] = [];

    for (const { id: tenantId, status } of targets) {
      try {
        const detail = await this.context.run(
          { tenantId, tenantStatus: status, jobId },
          () => this.runFor(jobId, tenantId),
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
        // Job hatası sessizce yutuluyor (diğer siteler koşmaya devam etsin)
        // ama izlemeye gitmeli: yutulan hata, kimsenin bakmadığı hatadır.
        captureException(error, { job: jobId });
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
      case "billing.trial-expiry":
        return expireTrial({ tenantId });
      case "sla.breach-check":
        return slaBreachCheck({ tenantId });
      case "meetings.reminders":
        return meetingReminders({ tenantId });
      case "documents.expiry":
        return documentExpiry({ tenantId });
      case "dues.reminder":
        return duesReminder({ tenantId });
      case "dues.late-warning":
        return duesLateWarning({ tenantId });
      case "billing.renewal":
        return renewSubscription({ tenantId });
      case "billing.dunning":
        return runDunning({ tenantId });
      case "billing.archive-purge":
        return purgeExpiredArchive({ tenantId });
      case "kvkk.request-sla":
        return kvkkRequestSla({ tenantId });
      case "kvkk.retention":
        return kvkkRetentionScan({ tenantId });
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
   *
   * DURUM DA OKUNUYOR, yalnız kimlik değil: `RequestContext.tenantStatus`
   * zorunlu bir alan ve job bağlamı onu uydurmamalı. Sabit `"active"` yazmak,
   * `past_due` bir sitenin job'ının bağlamda `active` görünmesi demekti —
   * denetim kütüğü ve ileride durum okuyacak her kod yanlış bilgilenirdi.
   * Aynı sorgudan geliyor, ek maliyeti yok.
   *
   * Tek site hedeflendiğinde (`only`) durum yine buradan çözülüyor: bulunamayan
   * ya da yazılamaz durumdaki site hedef listesinden düşüyor — elle tetiklenen
   * bir koşunun, zamanlanmış koşunun atladığı siteye yazması tutarsız olurdu.
   */
  private writableTenants(
    only?: string,
    statuses: readonly string[] = DEFAULT_TENANT_STATUSES,
  ): Promise<{ id: string; status: string }[]> {
    return this.db.bypass("job:tenants", async (tx) =>
      tx
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(
          and(
            inArray(tenants.status, [...statuses] as never),
            isNull(tenants.deletedAt),
            ...(only ? [eq(tenants.id, only)] : []),
          ),
        ),
    );
  }
}

/** Çoğu iş yalnız yazılabilir sitelerde koşuyor. */
const DEFAULT_TENANT_STATUSES = ["trial", "active", "past_due"] as const;

/**
 * Hedef kitlesi farklı olan işler. Dunning askıdaki (`suspended`) siteyi de
 * görmek zorunda (30. gün arşiv adımı orada); tasfiye yalnız arşivdekileri;
 * yenileme `trial`'ı hiç görmemeli.
 */
const JOB_TENANT_STATUSES: Record<string, readonly string[]> = {
  "billing.dunning": ["active", "past_due", "suspended"],
  "billing.renewal": ["active", "past_due"],
  "billing.archive-purge": ["archived"],
};

/** Gövdesi henüz yazılmamış iş — `skipped` olarak raporlanır. */
const NO_HANDLER = Symbol("no_handler");
