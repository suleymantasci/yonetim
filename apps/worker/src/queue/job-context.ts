import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";

import type { Role } from "@yonetim/core";

import type { ClsStore, RequestContext } from "@api/infra/cls/request-context";

/**
 * Job'ı bir `RequestContext` içinde çalıştırır — MIMARI-PLAN §8.1 / §10.
 *
 * Worker'ın HTTP isteği yok, dolayısıyla guard zinciri de yok. Ama
 * `DbService.tx()` bağlamsız çalışmıyor (fail-closed: bağlam yoksa 403) ve
 * bu bilinçli — bağlamsız bir sorgu, tenant sınırı olmayan bir sorgudur.
 *
 * Bu yüzden worker bağlamı **kendisi kuruyor**: `source: "internal"`, dördüncü
 * kimlik yolu. Guard'ın HTTP'de yaptığı işi burada job payload'u yapıyor;
 * ortaya çıkan bağlam ayırt edilemez, dolayısıyla RLS, denetim kütüğü ve
 * yetki kontrolü aynı kod yolundan geçiyor.
 *
 * `userId` **yok** ve olmamalı: job'ı bir insan tetiklemedi. Denetim kütüğünde
 * "sistem" olarak görünmesi doğru olan; uydurulmuş bir kullanıcı kimliği
 * yazmak, kütüğü yanlış bir insana işaret eder hâle getirirdi.
 */
@Injectable()
export class JobContext {
  constructor(private readonly cls: ClsService<ClsStore>) {}

  run<T>(
    params: { tenantId: string; tenantSlug?: string; jobId: string; requestId?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    const ctx: RequestContext = {
      tenantId: params.tenantId,
      tenantSlug: params.tenantSlug ?? "",
      // Job'ın kendi kimliği yok; RLS için gereken yetki `super_admin`
      // düzeyinde ama **tenant kapsamında** — baypas değil.
      roles: ["super_admin"] as Role[],
      scopes: [],
      locale: "tr",
      // İz kimliği job adını taşıyor: log'da hangi job'ın hangi koşuda
      // yazdığı, tenant tenant izlenebilsin.
      requestId: params.requestId ?? `job:${params.jobId}:${randomUUID()}`,
      source: "internal",
    };

    return this.cls.runWith({ ctx }, fn);
  }
}
