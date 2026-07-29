import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";

import { isPlatformRole } from "@yonetim/core";

import type { ClsStore } from "../../infra/cls/request-context";
import { ALLOW_ARCHIVED_KEY, PUBLIC_KEY } from "../decorators";

/**
 * Pasif siteye yazma kapısı — 2026-07-29 kararının uygulama tarafı.
 *
 * NEDEN GEREKLİ: `tenant_status` enum'unda `archived`, `suspended`,
 * `cancelled` baştan beri vardı ve **hiçbir kod yolu bu değerlere bakmıyordu**.
 * Yani bir siteyi arşivlemek yalnızca satırda bir etiket değiştirmek olurdu:
 * yönetici "bu siteyle işim bitti" dedikten sonra da aidat üretmeye, borç
 * silmeye, duyuru göndermeye devam edebilirdi. Faturalama durup erişim
 * durmazsa, ücretsiz sınırsız kullanım kapısı açılır.
 *
 * NEDEN GLOBAL GUARD, HER SERVİSTE KONTROL DEĞİL: yazma uçlarının sayısı
 * yüzlerce ve büyümeye devam ediyor. Kuralı uç uca dağıtmak, yeni yazılan her
 * ucun onu **unutabileceği** anlamına gelir — ve unutan uç sessizce daha gevşek
 * olur. Burada varsayılan kapalı: yeni bir yazma ucu yazıldığında hiçbir şey
 * yapmadan bu kuralın altına giriyor.
 *
 * NEDEN METODA GÖRE: okuma serbest. Arşivlenmiş sitenin verisi silinmiyor;
 * yönetici geçmiş dönemin raporunu, borç dökümünü, karar defterini okumaya
 * devam edebilmeli. Kapatılan şey yalnız **değiştirme**.
 *
 * Platform rolleri muaf: süper-admin arşivlenmiş siteyi geri açacak,
 * aboneliğini uzatacak, gerekirse tasfiye edecek. Muafiyet olmasa panel
 * kendi kurtarma düğmesini kilitlemiş olurdu.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Yazmaya açık durumlar. Liste **beyaz**: bilinmeyen durum yazma açmaz. */
const WRITABLE_STATUSES = new Set(["trial", "active", "past_due"]);

@Injectable()
export class TenantWritableGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<ClsStore>,
  ) {}

  canActivate(exec: ExecutionContext): boolean {
    const targets = [exec.getHandler(), exec.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }

    const req = exec.switchToHttp().getRequest<Request>();
    if (READ_METHODS.has(req.method)) return true;

    const ctx = this.cls.get("ctx");
    if (!ctx) return true; // Kimlik kararı `TenantContextGuard`'ın işi.

    if (WRITABLE_STATUSES.has(ctx.tenantStatus)) return true;
    if (ctx.roles.some(isPlatformRole)) return true;

    /*
     * Kurtarma uçları kendilerini muaf tutar: "arşivi geri aç" isteği tanımı
     * gereği arşivlenmiş bir siteye yazıyor. Muafiyet dekoratörle **açıkça**
     * beyan ediliyor; guard'ın uç adına göre tahmin yürütmesi, yol değişince
     * sessizce kapanan bir kurtarma düğmesi bırakırdı.
     */
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_ARCHIVED_KEY, targets)) {
      return true;
    }

    throw new ForbiddenException(`tenant_read_only:${ctx.tenantStatus}`);
  }
}
