import {
  BadRequestException,
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

import type { Permission } from "@yonetim/core";

export const PUBLIC_KEY = "yonetim:public";
export const PERMISSION_KEY = "yonetim:permission";
export const ALLOW_ARCHIVED_KEY = "yonetim:allow-archived";
export const RATE_LIMIT_SKIP_KEY = "yonetim:rate-limit-skip";

/** Kimlik gerektirmeyen uç — health, webhook, OpenAPI dokümanı. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Sağlık probu gibi altyapı uçlarını genel rate-limit'ten çıkarır. */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);

/**
 * Pasif/arşiv sitede de çalışan yazma ucu — `TenantWritableGuard` muafiyeti.
 *
 * Yalnız **kurtarma** uçları için: "arşivi geri aç" isteği tanımı gereği
 * arşivlenmiş bir siteye yazıyor, yani kuralın kendisi onu engellerdi. Muafiyet
 * uç adından tahmin edilmiyor, burada açıkça beyan ediliyor — yol adı değişince
 * sessizce kilitlenen bir kurtarma düğmesi bırakmamak için.
 */
export const AllowArchived = () => SetMetadata(ALLOW_ARCHIVED_KEY, true);

/**
 * Yetki bildirimi. Rol yolu `hasPermission` ile, API anahtarı yolu `scopes`
 * ile karşılanır: entegrasyona "yalnız borç okuma" verilebilmeli (§6.1).
 */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

/**
 * Gerekçe zorunluluğu — GAP-DURUM kararı 9.
 * `X-Change-Reason` başlığı yoksa/kısaysa 400 `reason_required`; kural
 * controller imzasında görünür olsun diye parametre dekoratörü.
 */
export const ChangeReason = createParamDecorator(
  (_data: unknown, exec: ExecutionContext) => {
    const req = exec.switchToHttp().getRequest<Request>();
    const raw = req.headers["x-change-reason"];
    const reason = (Array.isArray(raw) ? raw[0] : raw) ?? "";
    const decoded = decodeHeader(reason);
    if (decoded.trim().length < 10)
      throw new BadRequestException("reason_required");
    return decoded.trim();
  },
);

/** Zorunlu olmayan gerekçe (silme/geri alma gibi işlemlerde). */
export const OptionalChangeReason = createParamDecorator(
  (_data: unknown, exec: ExecutionContext) => {
    const req = exec.switchToHttp().getRequest<Request>();
    const raw = req.headers["x-change-reason"];
    const reason = (Array.isArray(raw) ? raw[0] : raw) ?? "";
    const decoded = decodeHeader(reason).trim();
    return decoded.length >= 10 ? decoded : undefined;
  },
);

/**
 * Başlıklar latin-1 taşır; Türkçe gerekçe metni `apps/app` tarafında
 * `encodeURIComponent` ile gönderiliyor. Çözme tek yerde.
 */
function decodeHeader(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
