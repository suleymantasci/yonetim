import { describe, expect, it } from "vitest";

import {
  JOBS,
  jobBySlug,
  SCHEDULE_TIMEZONE,
  scheduleEntries,
} from "@yonetim/jobs";

/**
 * B1 ÇIKIŞ ÖLÇÜTÜ — 19 cron tanımı repeatable job'a dönüştü (MIMARI-PLAN §10).
 *
 * `vercel.json` silindi; zamanlama artık `apps/worker` açılışında Redis'e
 * yazılıyor. Bu testin koruduğu şey tam olarak o dönüşümün **eksiksizliği**:
 * tanımdan zamanlamaya giden yol tek fonksiyondan geçiyor ve bir job'ın
 * sessizce düşmesi ancak burada yakalanabilir — üretimde belirtisi "o iş hiç
 * çalışmadı" olur ve bu, aylar sonra fark edilen türden bir arızadır.
 */
describe("zamanlama tablosu", () => {
  it("her tanım bir zamanlama girdisi üretiyor", () => {
    const entries = scheduleEntries();
    expect(entries).toHaveLength(JOBS.length);
    expect(entries.map((e) => e.name).sort()).toEqual(
      JOBS.map((j) => j.id).sort(),
    );
  });

  it("job kimlikleri tekil", () => {
    // Aynı kimlikten iki tanım olsaydı ikincisi birincinin repeatable
    // kaydını sessizce ezerdi: iki iş, tek koşu.
    const ids = JOBS.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cron ifadeleri beş alanlı ve ayrıştırılabilir", () => {
    for (const entry of scheduleEntries()) {
      const fields = entry.cron.trim().split(/\s+/);
      expect(fields, `${entry.name}: "${entry.cron}"`).toHaveLength(5);
      for (const field of fields) {
        expect(field, `${entry.name}: "${entry.cron}"`).toMatch(
          /^[0-9*,/-]+$/,
        );
      }
    }
  });

  it("zaman dilimi İstanbul — sunucunun TZ'sine güvenilmiyor", () => {
    // Konteyner UTC ile ayağa kalkarsa "her ayın 1'i 03:00" üç saat kayar ve
    // aidatın hangi ayda doğduğu tam da o üç saate bakıyor.
    expect(SCHEDULE_TIMEZONE).toBe("Europe/Istanbul");
  });

  it("slug ile tanım bulunabiliyor — elle tetikleme ucu buna dayanıyor", () => {
    for (const definition of JOBS) {
      const slug = definition.id.replace(/\./g, "-");
      expect(jobBySlug(slug)?.id, slug).toBe(definition.id);
    }
  });

  it("zaman aşımı süreleri makul aralıkta", () => {
    for (const definition of JOBS) {
      // Üst sınır yok denecek kadar geniş değil: süresiz bir job, takılan bir
      // job'ın fark edilmemesi demek. Alt sınır da anlamlı — 10 saniyeye
      // sığmayacağını bildiğimiz işler var.
      expect(definition.timeoutSeconds, definition.id).toBeGreaterThanOrEqual(60);
      expect(definition.timeoutSeconds, definition.id).toBeLessThanOrEqual(3600);
    }
  });
});
