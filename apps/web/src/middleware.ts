import createMiddleware from "next-intl/middleware";

import { routing } from "@yonetim/i18n/routing";

/**
 * Dil algılama ve yönlendirme — SPEC Bölüm 4.2 / 10.1.
 *
 * Türkçe önek almaz (mevcut adresler korunur), İngilizce `/en` önekiyle sunulur.
 * Tenant landing sayfaları (`/[slug]`) de bu eşleştiriciden geçer; next-intl
 * bilinen dil kodları dışındaki ilk segmenti varsayılan dile ait sayar.
 */
export default createMiddleware(routing);

export const config = {
  matcher: [
    // API, statik dosyalar ve dosya uzantılı istekler hariç her şey.
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|.*\\..*).*)",
  ],
};
