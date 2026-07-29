import { NextResponse } from "next/server";

import { apiPost } from "@/lib/api/server";
import { endImpersonation } from "@/lib/impersonation-cookie";

/**
 * Hesaba geçişten çıkış — SPEC Bölüm 18.2.
 *
 * NEDEN SERVER ACTION DEĞİL DE ROTA: bu çağrı **impersonation oturumuyla**,
 * yani müşterinin kimliğiyle geliyor. `runAction` yardımcısı her aksiyonun
 * başında bir izin istiyor ve o an oturumda olan kişi müşteri — hiçbir
 * `admin:*` izni yok. Rota, izin kapısı olmadan çalışıyor; gerçek kapı
 * `apps/api` tarafında ve farklı bir soru soruyor: "bu oturum bir
 * impersonation oturumu mu" (`impersonatedBy` dolu mu).
 *
 * SIRA ÖNEMLİ: API çağrısı **önce** gidiyor, çerez sonra değişiyor. Ters sırada
 * çerez yönetici oturumuna dönmüş olurdu ve API'ye giden istek artık
 * impersonation oturumunu taşımadığı için o oturum sunucuda **silinmeden**
 * kalırdı — süresi dolana kadar geçerli, yani 30 dakika boyunca müşteri
 * hesabına açık bir kapı.
 */
export async function POST(request: Request) {
  // Oturum zaten geçersizse (süre doldu) hata yutuluyor: kullanıcıyı kendi
  // hesabına döndürmek her koşulda doğru sonuç.
  await apiPost("/v1/panel/platform/impersonate/stop", {}).catch(() => undefined);

  const { restored } = await endImpersonation();
  return NextResponse.redirect(
    new URL(restored ? "/yonetim" : "/giris", request.url),
    { status: 303 },
  );
}
