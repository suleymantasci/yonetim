import type { ClsStore as BaseClsStore } from "nestjs-cls";

import type { Permission, Role } from "@yonetim/core";

/**
 * İstek bağlamı — MIMARI-PLAN §8.1.
 *
 * **Dört kimlik yolu, tek çıktı.** Panel cookie'si, mobil JWT, muhasebe
 * yazılımının API anahtarı ve worker'ın iç token'ı `ContextResolver`'da
 * ayrı ayrı çözülür; buraya vardıkları an birbirinden ayırt edilemez hale
 * gelirler. Yetki, RLS ve denetim böylece **tek** kod yolunda kalır.
 */
export interface RequestContext {
  tenantId: string;
  tenantSlug: string;
  /**
   * Sitenin yaşam döngüsü durumu — `TenantWritableGuard`'ın dayanağı.
   *
   * Bağlamda taşınıyor çünkü kimlik çözülürken tenant satırı **zaten**
   * okunuyor; guard'ın ayrı bir sorgu açması her yazma isteğine bir
   * gidiş-dönüş eklerdi. Bedeli: oturum önbelleği (60 sn) durumu de
   * önbelleğe alıyor, yani arşivleme en kötü durumda 60 sn gecikmeyle
   * etkili oluyor. Arşivleyen kişinin kendi oturumu bu yüzden işlem
   * sonunda düşürülüyor.
   */
  tenantStatus: string;
  /** API anahtarı yolunda yok — o yolda `apiKeyId` dolu olur. */
  userId?: string;
  apiKeyId?: string;
  roles: Role[];
  /** API anahtarı kapsamları; rol yerine geçer (entegrasyona dar yetki). */
  scopes: Permission[];
  impersonatedBy?: string;
  ip?: string;
  userAgent?: string;
  locale: string;
  requestId: string;
  source: "session" | "mobile" | "api_key" | "internal";
  /** Gerekçeli düzeltme (GAP-DURUM kararı 9) — `X-Change-Reason` başlığı. */
  changeReason?: string;
}

/** `nestjs-cls` store şekli. Tek anahtar: bağlamın parçalanmasını önler. */
export interface ClsStore extends BaseClsStore {
  ctx: RequestContext;
}

export const CLS_CTX_KEY = "ctx" as const;
