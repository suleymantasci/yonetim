import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import { appContext } from "@yonetim/contracts";
import { AppError, errors, type Permission, type Role, type TenantContext } from "@yonetim/core";

import { apiGet } from "./api/server";

/**
 * İstek bağlamı çözümleyicisi — SPEC Bölüm 13.2/13.3, MIMARI-PLAN §8.1.
 *
 * OTURUM OTORİTESİ NEXT'TE DEĞİL. Bu dosya eskiden cookie'yi kendisi çözüp
 * üyelik ve rolleri veritabanından okuyordu; artık `GET /v1/auth/context`
 * çağırıyor ve cookie'yi olduğu gibi iletiyor. Fark yalnız mimari değil:
 * render katmanına "ben bu tenant'ın adminiyim" iddiasını üretme yetkisi
 * verilmiyor, dolayısıyla bir yetki iptali anında etkili oluyor.
 *
 * `apiGet` render içi `cache()`'li olduğu için layout + sayfa aynı bağlamı
 * isterse tek hop oluyor.
 */
export interface AppContext extends TenantContext {
  tenantName: string;
  /** Kabukta gösterilen ad — sunucuda birleştirilmiş hâli. */
  userName: string;
  tenantStatus: string;
  /** Kullanıcının erişebildiği diğer siteler — site değiştirici için. */
  memberships: Array<{ id: string; slug: string; name: string }>;
}

/**
 * Oturum var mı — yalnız "giriş yapılmış mı" sorusu için.
 *
 * Cookie'nin **varlığına** bakıyor, geçerliliğine değil: geçerlilik kararı
 * `apps/api`'nin ve onu burada taklit etmek iki farklı doğruluk kaynağı
 * yaratırdı. Gerçek doğrulama `requireContext()` çağrısında, API tarafında
 * yapılıyor.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE)?.value);
}

export async function requireContext(): Promise<AppContext> {
  const h = await headers();

  let resolved;
  try {
    resolved = await apiGet("/v1/auth/context", appContext);
  } catch (error) {
    if (error instanceof AppError) {
      /**
       * 401 iki farklı durumu birden anlatıyor ve ayrımı burada yapmak
       * gerekiyor: `apps/api`'nin bağlam çözücüsü, üyeliği olmayan kullanıcı
       * için hiç kimlik üretmiyor (`resolveTenantForUser` tenant bulamayınca
       * `null` dönüyor), yani "oturum yok" ile "oturum var ama sitesi yok"
       * aynı 401'e düşüyor.
       *
       * Ayrım yapılmazsa ikinci durumdaki kullanıcı `/giris`e gidiyor, giriş
       * yapıyor, yine 401 alıp yine `/giris`e düşüyordu — sonsuz döngü. Bu
       * yüzden çerez varsa kurulum akışına gönderiliyor; çerez geçersizse
       * `/kurulum` da onu `/giris`e geri yolluyor ve döngü kapanıyor.
       *
       * 404 = kullanıcı var, site var ama erişim yok → yine kurulum.
       */
      if (error.code === "unauthorized") {
        redirect((await hasSessionCookie()) ? "/kurulum" : "/giris");
      }
      if (error.code === "not_found") redirect("/kurulum");
    }
    throw error;
  }

  return {
    tenantId: resolved.tenantId,
    tenantSlug: resolved.tenantSlug,
    tenantName: resolved.tenantName,
    userName: resolved.userName,
    tenantStatus: resolved.tenantStatus,
    userId: resolved.userId,
    roles: resolved.roles as Role[],
    impersonatedBy: resolved.impersonatedBy ?? undefined,
    ip: h.get("x-client-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
    locale: resolved.locale,
    memberships: resolved.memberships,
  };
}

/**
 * Yetki kapısı — **görünürlük** için.
 *
 * Gerçek kapı API tarafında: her uç kendi `@RequirePermission`'ını taşıyor.
 * Buradaki kontrol, yetkisiz kullanıcının hiç göremeyeceği bir ekranı açıp
 * boş tablo görmesini engelliyor. İkisinden biri kaldırılacaksa bu taraf
 * kaldırılabilir; API tarafı kaldırılamaz.
 */
export async function requirePermission(permission: Permission): Promise<AppContext> {
  const ctx = await requireContext();
  if (!hasPermission(ctx.roles, permission)) {
    throw errors.forbidden(
      (await getTranslations("common.error"))("forbiddenPermission", { permission }),
    );
  }
  return ctx;
}

export function can(ctx: AppContext, permission: Permission): boolean {
  return hasPermission(ctx.roles, permission);
}
