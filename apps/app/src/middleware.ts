import { NextResponse, type NextRequest } from "next/server";

import { siteConfig } from "@yonetim/config";

/**
 * Tenant tespiti — SPEC Bölüm 13.1.
 * `[slug].app.domain` alt alan adı okunur ve `x-tenant-slug` başlığına yazılır.
 * Ayrıca oturum çerezi yoksa korumalı rotalar /giris'e yönlendirilir.
 */
const PUBLIC_PATHS = [ "/giris", "/kayit", "/kayit-talebi", "/sifre-sifirla", "/api/webhooks", "/api/public", "/api/cron", "/api/health",
  // Belge doğrulama: banka/kurum hesap açmadan belgenin gerçekliğini teyit eder
  // (SPEC Bölüm 3.6). Kişisel veri döndürmez. "/belge/dogrula",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const headers = new Headers(request.headers);

  const slug = extractTenantSlug(host);
  if (slug) headers.set("x-tenant-slug", slug);
  headers.set("x-request-path", pathname);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-client-ip", forwardedFor.split(",")[0]!.trim());

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = request.cookies.has("yonetim_session");

  if (!isPublic && !hasSession && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("devam", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers } });
}

/** `merkez-mahallesi.app.example.com` → `merkez-mahallesi` */
function extractTenantSlug(host: string): string | null {
  const bare = host.split(":")[0] ?? "";
  if (!bare || bare === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(bare)) return null;

  const appHost = siteConfig.domains.app;
  if (bare === appHost || bare === siteConfig.domains.base) return null;

  if (bare.endsWith(`.${appHost}`)) {
    return bare.slice(0, -(appHost.length + 1)) || null;
  }
  // Yerel geliştirme: `demo.localhost:3001`
  if (bare.endsWith(".localhost")) {
    return bare.slice(0, -".localhost".length) || null;
  }
  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)"],
};
