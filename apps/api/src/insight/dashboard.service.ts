import { Injectable } from "@nestjs/common";

import type { DashboardResponse } from "@yonetim/contracts";

import { DashboardRepository } from "./dashboard.repository";

/** Aktivite akışında kaç satır gösteriliyor (GAP 4.3.4). */
const ACTIVITY_LIMIT = 12;

/**
 * Kontrol paneli — MIMARI-PLAN §9a "bir ekran = bir çağrı".
 *
 * Özet, grafikler ve aktivite akışı tek yanıtta birleşiyor. Üçünü ayrı uçlara
 * bölmek "REST'e daha uygun" görünürdü ama panel açılışını üç gidiş-dönüşe
 * çıkarırdı; uç ekranın ihtiyacına göre şekilleniyor.
 *
 * Panel kişisel veri **listelemiyor** (isim, telefon, TCKN yok), bu yüzden
 * burada KVKK erişim kaydı da yok: §8.4'ün kuralı "dönen kümeyi logla", dönen
 * kümede kişi olmadığında yazılacak satır da yok. Aktivite akışı bilinçli
 * olarak aktör **adını taşımıyor** — bkz. aşağıdaki not.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly repo: DashboardRepository) {}

  async overview(): Promise<DashboardResponse> {
    const summary = await this.repo.summary();

    // Boş sitede grafik hesaplanmıyor: on iki aylık seri üretmek hem anlamsız
    // hem de ekranda gösterilen tek şey "önce birim ekleyin" boş durumu.
    // Karar sözleşmede de görünür (`charts: nullable`).
    const [charts, activity] = await Promise.all([
      summary.unitCount === 0 ? Promise.resolve(null) : this.repo.charts(),
      this.repo.recentActivity(ACTIVITY_LIMIT),
    ]);

    return {
      summary,
      charts,
      activity: activity.map((row) => ({
        id: row.id,
        action: row.action,
        resource: row.resource,
        resourceId: row.resourceId ?? null,
        // Aktör adı `users` tablosunda ve o tablo RLS dışında; adı getirmek
        // panel açılışına dar kapsamlı bir baypas eklemek olurdu. Akış için
        // eylemin kendisi yeterli, isim denetim ekranında görünüyor.
        actorName: null,
        reason: row.reason,
        createdAt: row.createdAt,
      })),
    };
  }
}
