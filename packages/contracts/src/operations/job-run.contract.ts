import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * Uzun süren iş — ilerleme ve iptal (MIMARI-PLAN §10 B3, GAP 4.1.17'nin önkoşulu).
 *
 * NEDEN AYRI BİR KAVRAM: zamanlanmış işler kimseyi bekletmiyor — gece koşar,
 * sabah sonucu görülür. Excel göçü, toplu borç üretimi ve PDF paketi ise bir
 * **insanın ekran başında beklediği** işler. O insan üç şeyi görmek zorunda:
 * ne kadar kaldı, ne oldu, vazgeçebilir miyim.
 *
 * Vercel'de bu mümkün değildi: 300 saniyelik duvar hem işi kesiyordu hem de
 * ilerleme bildirecek bir kanal bırakmıyordu. Kuyruğun asıl açtığı boşluk bu.
 *
 * İPTAL "KUYRUKTAN SİLME" DEĞİL. Silinen job zaten yarısını yazmış olabilir;
 * kaydı geri almadan durdurmak veriyi tutarsız bırakır. Bunun yerine iptal bir
 * **bayrak**: iş kendi döngüsünde bayrağı okuyup temiz bir noktada duruyor ve
 * o ana kadar yaptığını `partial` olarak raporluyor.
 */
export const jobRunStatus = z.enum([
  "queued",
  "running",
  /** İptal istendi ama iş henüz temiz bir noktaya gelmedi. */
  "cancelling",
  "completed",
  /** İptal edildi; o ana kadar yapılan iş kalıcı. */
  "cancelled",
  "failed",
]);

export type JobRunStatus = z.infer<typeof jobRunStatus>;

export const jobRunProgress = z.object({
  /** İşlenmiş birim sayısı. */
  processed: z.number().int().min(0),
  /**
   * Toplam birim — bilinmiyorsa `null`.
   *
   * Bilinmeyeni 0 ile göstermek "%0 tamamlandı" gibi okunur ve bekleyen kişiye
   * yanlış bilgi verir; belirsizliği belirsiz göstermek daha dürüst.
   */
  total: z.number().int().min(0).nullable(),
  /** Kullanıcıya gösterilecek son adım — dile bağımsız anahtar. */
  step: z.string().nullable(),
});

export const jobRunRow = z.object({
  id: uuid,
  kind: z.string(),
  status: jobRunStatus,
  progress: jobRunProgress,
  /** Kaç kayıt başarılı/başarısız — `partial` sonuçta da dolu. */
  succeeded: z.number().int(),
  failed: z.number().int(),
  /** İlk 50 hata; tamamı sunucuda. Ekranda hepsini göstermek okunmaz olurdu. */
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
  startedAt: dateTime.nullable(),
  finishedAt: dateTime.nullable(),
  createdAt: dateTime,
});

export type JobRunRow = z.infer<typeof jobRunRow>;

export const jobRunList = z.object({ rows: z.array(jobRunRow) });
