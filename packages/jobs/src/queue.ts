import { JOBS, type JobDefinition } from "./definitions";

/**
 * Kuyruk sözleşmesi — üretici (`apps/api`) ile tüketici (`apps/worker`) arasında.
 *
 * NEDEN `packages/jobs` İÇİNDE: kuyruk adı ve job gövdesi iki servisin
 * **ortak** bilgisi. Worker'da tanımlansaydı api onu import etmek zorunda
 * kalırdı (üretici tüketiciye bağımlı olurdu); api'de tanımlansaydı worker
 * çalışmak için web servisinin kodunu çekerdi. İkisi de yanlış yön —
 * paylaşılan sözleşme paylaşılan pakete ait.
 */
export const QUEUE_SCHEDULED = "scheduled";

/** Zamanlanmış işin kuyruğa giden gövdesi. */
export interface ScheduledJobData {
  jobId: string;
  /**
   * Hangi tenant için — boşsa job tüm aktif siteleri dolaşır.
   *
   * Fan-out **job içinde** yapılıyor, kuyrukta değil: 19 job × N site kadar
   * repeatable tanım üretmek, site sayısı arttıkça Redis'te yönetilemez bir
   * tablo bırakırdı. Alan yine de var, çünkü elle tetiklemede tek bir siteyi
   * yeniden koşturmak gerçek bir ihtiyaç.
   */
  tenantId?: string;
  /** Elle tetikleyen kullanıcı — denetim izinde görünsün. */
  triggeredBy?: string;
}

/**
 * Cron ifadeleri **Europe/Istanbul**'a göre yazıldı (SPEC Bölüm 6.1).
 *
 * Sunucunun `TZ`'sine güvenmek, konteyner UTC ile ayağa kalktığında "her ayın
 * 1'i saat 03:00" kuralını üç saat kaydırırdı — aidatın hangi ayda doğduğu
 * ay başında tam da bu üç saate bakıyor.
 */
export const SCHEDULE_TIMEZONE = "Europe/Istanbul";

export interface ScheduleEntry {
  /** BullMQ job adı — `JobDefinition.id` ile birebir. */
  name: string;
  cron: string;
  definition: JobDefinition;
}

/**
 * Zamanlama tablosu — `vercel.json`'ın yerine (MIMARI-PLAN §10, B1).
 *
 * TEK KAYNAK `definitions.ts`. İkinci bir liste tutulmuyor: iki liste er ya
 * da geç ayrışır ve ayrıştığında kimse fark etmez — bir job sessizce hiç
 * çalışmaz.
 */
export function scheduleEntries(): ScheduleEntry[] {
  return JOBS.map((definition) => ({
    name: definition.id,
    cron: definition.cron,
    definition,
  }));
}
