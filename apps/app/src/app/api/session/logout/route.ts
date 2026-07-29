import { NextResponse } from "next/server";

import { apiPost } from "@/lib/api/server";
import { clearSessionCookie } from "@/lib/session-cookie";

/**
 * Çıkış — oturum kaydını `apps/api` siliyor, çerezi burası düşürüyor.
 *
 * İki adım da gerekli: yalnız çerezi silmek tarayıcının kopyasını unutturur
 * ama çalınmış bir jetonu geçersiz kılmaz; yalnız kaydı silmek de kullanıcıyı
 * kendi tarayıcısında oturum açmış gösterirdi.
 */
export async function POST(request: Request) {
  await apiPost("/v1/auth/web/logout", {});
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/giris", request.url), { status: 303 });
}
